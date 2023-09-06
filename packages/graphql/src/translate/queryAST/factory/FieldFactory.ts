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
import type { Field } from "../ast/fields/Field";
import { parseSelectionSetField } from "./parsers/parse-selection-set-fields";
import type { QueryASTFactory } from "./QueryASTFactory";
import { PointAttributeField } from "../ast/fields/attribute-fields/PointAttributeField";
import { AttributeField } from "../ast/fields/attribute-fields/AttributeField";
import { DateTimeField } from "../ast/fields/attribute-fields/DateTimeField";
import type { AggregationField } from "../ast/fields/aggregation-fields/AggregationField";
import { CountField } from "../ast/fields/aggregation-fields/CountField";
import { filterTruthy } from "../../../utils/utils";
import { AggregationAttributeField } from "../ast/fields/aggregation-fields/AggregationAttributeField";
import { OperationField } from "../ast/fields/OperationField";
import { CypherAttributeField } from "../ast/fields/attribute-fields/CypherAttributeField";
import type { AttributeAdapter } from "../../../schema-model/attribute/model-adapters/AttributeAdapter";
import { RelationshipAdapter } from "../../../schema-model/relationship/model-adapters/RelationshipAdapter";
import { ConcreteEntityAdapter } from "../../../schema-model/entity/model-adapters/ConcreteEntityAdapter";
import type { Neo4jGraphQLTranslationContext } from "../../../types/neo4j-graphql-translation-context";
import { Entity } from "../../../schema-model/entity/Entity";
import type { ConcreteEntity } from "../../../schema-model/entity/ConcreteEntity";

export class FieldFactory {
    private queryASTFactory: QueryASTFactory;
    constructor(queryASTFactory: QueryASTFactory) {
        this.queryASTFactory = queryASTFactory;
    }

    public createFields(
        entity: ConcreteEntityAdapter | RelationshipAdapter,
        rawFields: Record<string, ResolveTree>,
        context: Neo4jGraphQLTranslationContext
    ): Field[] {
        return Object.values(rawFields).map((field: ResolveTree) => {
            const { fieldName, isConnection, isAggregation } = parseSelectionSetField(field.name);
            if (isConnection) {
                if (entity instanceof RelationshipAdapter)
                    throw new Error("Cannot create connection field of relationship");
                return this.createConnectionField(entity, fieldName, field, context);
            }

            if (isAggregation) {
                if (entity instanceof RelationshipAdapter)
                    throw new Error("Cannot create aggregation field of relationship");

                const relationship = entity.findRelationship(fieldName);
                if (!relationship) throw new Error("Relationship for aggregation not found");
                return this.createRelationshipAggregationField(relationship, fieldName, field);
            }

            if (entity instanceof ConcreteEntityAdapter) {
                const relationship = entity.findRelationship(fieldName);
                if (relationship) {
                    return this.createRelationshipField(entity, relationship, fieldName, field, context);
                }
            }

            return this.createAttributeField({
                entity,
                fieldName,
                field,
                context,
            });
        });
    }

    private createRelationshipAggregationField(
        relationship: RelationshipAdapter,
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
        entity: ConcreteEntityAdapter | RelationshipAdapter,
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
        context,
    }: {
        entity: ConcreteEntityAdapter | RelationshipAdapter;
        fieldName: string;
        field: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
    }): AttributeField {
        const attribute = entity.findAttribute(fieldName);
        if (!attribute) throw new Error(`attribute ${fieldName} not found`);

        if (attribute.annotations.cypher) {
            return this.createCypherAttributeField({
                entity,
                fieldName,
                field,
                attribute,
                context,
            });
        }

        if (attribute.isPoint()) {
            const typeName = attribute.isList() ? attribute.type.ofType.name : attribute.type.name;
            const { crs } = field.fieldsByTypeName[typeName] as any;
            return new PointAttributeField({
                attribute,
                alias: field.alias,
                crs: Boolean(crs),
            });
        }

        if (attribute.isDateTime()) {
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
        context,
    }: {
        entity: ConcreteEntityAdapter | RelationshipAdapter;
        attribute: AttributeAdapter;
        fieldName: string;
        field: ResolveTree;
        context: Neo4jGraphQLTranslationContext;
    }): CypherAttributeField {
        const typeName = attribute.isList() ? attribute.type.ofType.name : attribute.type.name;
        const rawFields = field.fieldsByTypeName[typeName];
        let cypherProjection: Record<string, string> | undefined;
        let nestedFields: Field[] | undefined;

        if (rawFields) {
            cypherProjection = Object.values(rawFields).reduce((acc, f) => {
                acc[f.alias] = f.name;
                return acc;
            }, {});
            // if the attribute is an object or an abstract type we may have nested fields
            if (attribute.isAbstract() || attribute.isObject()) {
                // TODO: this code block could be handled directly in the schema model or in some schema model helper
                const targetEntity = this.queryASTFactory.schemaModel.getEntity(typeName);
                // Raise an error as we expect that any complex attributes type are always entities
                if (!targetEntity) throw new Error(`Entity ${typeName} not found`);
                if (this.queryASTFactory.schemaModel.isConcreteEntity(targetEntity)) {
                    const concreteEntityAdapter = new ConcreteEntityAdapter(targetEntity);
                    nestedFields = this.createFields(concreteEntityAdapter, rawFields, context);
                }
                // TODO: implement composite entities
            }
        }

        return new CypherAttributeField({
            attribute,
            alias: field.alias,
            projection: cypherProjection,
            nestedFields,
        });
    }

    private createConnectionField(
        entity: ConcreteEntityAdapter,
        fieldName: string,
        field: ResolveTree,
        context: Neo4jGraphQLTranslationContext
    ): OperationField {
        const relationship = entity.findRelationship(fieldName);
        if (!relationship) throw new Error(`Relationship  ${fieldName} not found in entity ${entity.name}`);
        const connectionOp = this.queryASTFactory.operationsFactory.createConnectionOperationAST(
            relationship,
            field,
            context
        );

        return new OperationField({
            operation: connectionOp,
            alias: field.alias,
        });
    }

    private createRelationshipField(
        entity: ConcreteEntityAdapter,
        relationship: RelationshipAdapter,
        fieldName: string,
        field: ResolveTree,
        context: Neo4jGraphQLTranslationContext
    ): OperationField {
        // const nestedFields = field.fieldsByTypeName[entity.name];
        // if (!relationship) throw new Error(`Relationship  ${fieldName} not found in entity ${entity.name}`);
        // const connectionOp = this.queryASTFactory.operationsFactory.createConnectionOperationAST(relationship, field);

        const operation = this.queryASTFactory.operationsFactory.createReadOperationAST(relationship, field, context);

        return new OperationField({
            operation,
            alias: field.alias,
        });
    }
}
