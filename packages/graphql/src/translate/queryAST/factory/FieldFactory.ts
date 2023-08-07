/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { ResolveTree } from "graphql-parse-resolve-info";
import { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";
import type { Field } from "../ast/fields/Field";
import { parseSelectionSetField } from "./parsers/parse-selection-set-fields";
import type { QueryASTFactory } from "./QueryASTFactory";
import { Relationship } from "../../../schema-model/relationship/Relationship";
import type { Attribute } from "../../../schema-model/attribute/Attribute";
import { AttributeType, Neo4jGraphQLSpatialType, Neo4jGraphQLTemporalType, ScalarType } from "../../../schema-model/attribute/AttributeType";
import { PointAttributeField } from "../ast/fields/attribute-fields/PointAttributeField";
import { AttributeField } from "../ast/fields/attribute-fields/AttributeField";
import { DateTimeField } from "../ast/fields/attribute-fields/DateTimeField";
import type { AggregationField } from "../ast/fields/aggregation-fields/AggregationField";
import { CountField } from "../ast/fields/aggregation-fields/CountField";
import { filterTruthy } from "../../../utils/utils";
import { AggregationAttributeField } from "../ast/fields/aggregation-fields/AggregationAttributeField";
import { OperationField } from "../ast/fields/OperationField";
import { CypherAttributeField } from "../ast/fields/attribute-fields/CypherAttributeField";
import { AttributeAdapter } from "../../../schema-model/attribute/model-adapters/AttributeAdapter";

export class FieldFactory {
    private queryASTFactory: QueryASTFactory;
    constructor(queryASTFactory: QueryASTFactory) {
        this.queryASTFactory = queryASTFactory;
    }

    public createFields(entity: ConcreteEntity | Relationship, rawFields: Record<string, ResolveTree>): Field[] {
        return Object.values(rawFields).map((field: ResolveTree) => {
            const { fieldName, isConnection, isAggregation } = parseSelectionSetField(field.name);
            if (isConnection) {
                if (entity instanceof Relationship) throw new Error("Cannot create connection field of relationship");
                return this.createConnectionField(entity, fieldName, field);
            }

            if (isAggregation) {
                if (entity instanceof Relationship) throw new Error("Cannot create aggregation field of relationship");

                const relationship = entity.findRelationship(fieldName);
                if (!relationship) throw new Error("Relationship for aggregation not found");
                return this.createRelationshipAggregationField(relationship, fieldName, field);
            }

            if (entity instanceof ConcreteEntity) {
                const relationship = entity.findRelationship(fieldName);
                if (relationship) {
                    return this.createRelationshipField(entity, relationship, fieldName, field);
                }
            }

            return this.createAttributeField({
                entity,
                fieldName,
                field,
            });
        });
    }

    private createRelationshipAggregationField(
        relationship: Relationship,
        fieldName: string,
        resolveTree: ResolveTree
    ): OperationField {
        // const operation = this.queryASTFactory.operationsFactory.createReadOperationAST(relationship, field);
        // console.log(fieldName, resolveTree, relationship.aggregationFieldTypename);

        // const args = resolveTree.args;
        // const fields = resolveTree.fieldsByTypeName[relationship.aggregationFieldTypename];

        const operation = this.queryASTFactory.operationsFactory.createAggregationOperation(relationship, resolveTree);
        return new OperationField({
            alias: resolveTree.alias,
            operation,
        });
    }

    public createAggregationFields(
        entity: ConcreteEntity | Relationship,
        rawFields: Record<string, ResolveTree>
    ): AggregationField[] {
        return filterTruthy(
            Object.values(rawFields).map((field) => {
                if (field.name === "count") {
                    return new CountField({
                        alias: field.alias,
                        entity,
                    });
                } else {
                    const attribute = entity.findAttribute(field.name);
                    if (!attribute) throw new Error(`Attribute ${field.name} not found`);
                    return new AggregationAttributeField({
                        attribute,
                        alias: field.alias,
                    });
                }
            })
        );
    }

    private createAttributeField({
        entity,
        fieldName,
        field,
    }: {
        entity: ConcreteEntity | Relationship;
        fieldName: string;
        field: ResolveTree;
    }): AttributeField {
        const attribute = entity.findAttribute(fieldName);
        if (!attribute) throw new Error(`attribute ${fieldName} not found`);
        const attributeAdapter = new AttributeAdapter(attribute);

        if (attribute.annotations.cypher) {
            return this.createCypherAttributeField({
                entity,
                fieldName,
                field,
                attribute,
            });
            // return new CypherAttributeField({
            //     attribute,
            //     alias: field.alias,
            // });
        }

        if (attributeAdapter.isPoint() || attributeAdapter.isListOf(Neo4jGraphQLSpatialType.Point)) {
            const typeName = attributeAdapter.isList() ? attributeAdapter.type.ofType.name : attribute.type.name;
            const { crs } = field.fieldsByTypeName[typeName] as any;
            return new PointAttributeField({
                attribute,
                alias: field.alias,
                crs: Boolean(crs),
            });
        }

        if (attributeAdapter.isDateTime() || attributeAdapter.isListOf(Neo4jGraphQLTemporalType.DateTime)) {
            return new DateTimeField({
                attribute,
                alias: field.alias,
            });
        }

        return new AttributeField({ alias: field.alias, attribute });
    }

    private createCypherAttributeField({
        entity,
        fieldName,
        field,
        attribute,
    }: {
        entity: ConcreteEntity | Relationship;
        attribute: Attribute;
        fieldName: string;
        field: ResolveTree;
    }): CypherAttributeField {
        // console.log(fieldName);
        // console.log(field.fieldsByTypeName);

        const fields = Object.values(field.fieldsByTypeName)[0]; // TODO: use actual Field type

        // TODO: get the actual entity related to this attribute!!
        console.log(fields, attribute);

        let cypherProjection: Record<string, string> | undefined; //Alias-value of cypher projection
        if (fields) {
            cypherProjection = Object.values(fields).reduce((acc, f) => {
                acc[f.alias] = f.name;
                return acc;
            }, {});
        }

        return new CypherAttributeField({
            attribute,
            alias: field.alias,
            projection: cypherProjection,
        });
    }

    private createConnectionField(entity: ConcreteEntity, fieldName: string, field: ResolveTree): OperationField {
        const relationship = entity.findRelationship(fieldName);
        if (!relationship) throw new Error(`Relationship  ${fieldName} not found in entity ${entity.name}`);
        const connectionOp = this.queryASTFactory.operationsFactory.createConnectionOperationAST(relationship, field);

        return new OperationField({
            operation: connectionOp,
            alias: field.alias,
        });
    }

    private createRelationshipField(
        entity: ConcreteEntity,
        relationship: Relationship,
        fieldName: string,
        field: ResolveTree
    ): OperationField {
        // const nestedFields = field.fieldsByTypeName[entity.name];
        // if (!relationship) throw new Error(`Relationship  ${fieldName} not found in entity ${entity.name}`);
        // const connectionOp = this.queryASTFactory.operationsFactory.createConnectionOperationAST(relationship, field);

        const operation = this.queryASTFactory.operationsFactory.createReadOperationAST(relationship, field);

        return new OperationField({
            operation,
            alias: field.alias,
        });
    }
}
