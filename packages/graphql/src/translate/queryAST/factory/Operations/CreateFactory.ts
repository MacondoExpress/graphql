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

import Cypher from "@neo4j/cypher-builder";
import type { ResolveTree } from "graphql-parse-resolve-info";
import type { AttributeAdapter } from "../../../../schema-model/attribute/model-adapters/AttributeAdapter";
import type { ConcreteEntityAdapter } from "../../../../schema-model/entity/model-adapters/ConcreteEntityAdapter";
import type { RelationshipAdapter } from "../../../../schema-model/relationship/model-adapters/RelationshipAdapter";
import type { Neo4jGraphQLTranslationContext } from "../../../../types/neo4j-graphql-translation-context";
import { asArray } from "../../../../utils/utils";
import { IdField } from "../../ast/input-fields/IdField";
import { MutationOperationField } from "../../ast/input-fields/MutationOperationField";
import { ReferenceInputField } from "../../ast/input-fields/ReferenceInputField";
import { TimestampField } from "../../ast/input-fields/TimestampField";
import { CreateOperation } from "../../ast/operations/CreateOperation";
import type { ReadOperation } from "../../ast/operations/ReadOperation";
import { UnwindCreateOperation } from "../../ast/operations/UnwindCreateOperation";
import { assertIsConcreteEntity, isConcreteEntity } from "../../utils/is-concrete-entity";
import { raiseAttributeAmbiguity } from "../../utils/raise-attribute-ambiguity";
import type { QueryASTFactory } from "../QueryASTFactory";

export class CreateFactory {
    private queryASTFactory: QueryASTFactory;

    constructor(queryASTFactory: QueryASTFactory) {
        this.queryASTFactory = queryASTFactory;
    }

    public createCreateOperation(
        entity: ConcreteEntityAdapter,
        resolveTree: ResolveTree,
        context: Neo4jGraphQLTranslationContext
    ): CreateOperation {
        const responseFields = Object.values(
            resolveTree.fieldsByTypeName[entity.operations.mutationResponseTypeNames.create] ?? {}
        );
        const createOP = new CreateOperation({ target: entity });
        const projectionFields = responseFields
            .filter((f) => f.name === entity.plural)
            .map((field) => {
                const readOP = this.queryASTFactory.operationsFactory.createReadOperation({
                    entityOrRel: entity,
                    resolveTree: field,
                    context,
                }) as ReadOperation;
                return readOP;
            });

        createOP.addProjectionOperations(projectionFields);
        return createOP;
    }

    public createUnwindCreateOperation(
        entity: ConcreteEntityAdapter,
        resolveTree: ResolveTree,
        context: Neo4jGraphQLTranslationContext
    ): UnwindCreateOperation {
        const responseFields = Object.values(
            resolveTree.fieldsByTypeName[entity.operations.mutationResponseTypeNames.create] ?? {}
        );
        const rawInput = resolveTree.args.input as Record<string, any>[];

        const unwindCreate = this.parseUnwindCreate({ target: entity, input: rawInput ?? [], context });

        const projectionFields = responseFields
            .filter((f) => f.name === entity.plural)
            .map((field) => {
                return this.queryASTFactory.operationsFactory.createReadOperation({
                    entityOrRel: entity,
                    resolveTree: field,
                    context,
                }) as ReadOperation;
            });

        unwindCreate.addProjectionOperations(projectionFields);
        return unwindCreate;
    }

    private parseUnwindCreate({
        target,
        relationship,
        input,
        context,
        unwindVariable = new Cypher.Param(input),
    }: {
        target: ConcreteEntityAdapter;
        relationship?: RelationshipAdapter;
        input: Record<string, any>[];
        context: Neo4jGraphQLTranslationContext;

        unwindVariable?: Cypher.Property | Cypher.Param;
    }): UnwindCreateOperation {
        const unwindCreate = new UnwindCreateOperation({
            target: relationship ?? target,
            argumentToUnwind: unwindVariable,
        });
        this.hydrateUnwindCreateOperation({ target, relationship, input, unwindCreate, context });

        return unwindCreate;
    }

    private hydrateUnwindCreateOperation({
        target,
        relationship,
        input,
        unwindCreate,
        context,
    }: {
        target: ConcreteEntityAdapter;
        relationship?: RelationshipAdapter;
        input: Record<string, any>[];
        unwindCreate: UnwindCreateOperation;
        context: Neo4jGraphQLTranslationContext;
    }) {
        const isNested = Boolean(relationship);
        this.addAutogeneratedFields({
            entity: target,
            relationship,
            unwindCreate,
        });

        this.addEntityAuthorization({ entity: target, context, unwindCreate });
        const unwindVariable = unwindCreate.getUnwindVariable();
        asArray(input).forEach((inputItem) => {
            const targetInput = this.getInputNode(inputItem, isNested);
            raiseAttributeAmbiguity(Object.keys(targetInput), target);
            raiseAttributeAmbiguity(Object.keys(this.getInputEdge(target)), relationship);
            for (const key of Object.keys(targetInput)) {
                const nestedRelationship = target.relationships.get(key);
                const attribute = target.attributes.get(key);
                if (attribute) {
                    const path = isNested
                        ? unwindVariable.property("node").property(key)
                        : unwindVariable.property(key);
                    this.addAttributeInputFieldToUnwindOperation({
                        entity: target,
                        attribute,
                        unwindCreate,
                        context,
                        path,
                        attachedTo: "node",
                    });
                } else if (nestedRelationship) {
                    const nestedEntity = nestedRelationship.target;
                    assertIsConcreteEntity(nestedEntity);
                    const relField = unwindCreate.getField(key, "node");
                    const nestedCreateInput = targetInput[key]?.create;
                    if (!relField) {
                        const partialPath = isNested ? unwindVariable.property("node") : unwindVariable;
                        this.addRelationshipInputFieldToUnwindOperation({
                            relationship: nestedRelationship,
                            unwindCreate,
                            context,
                            path: partialPath.property(nestedRelationship.name).property("create"),
                            nestedCreateInput,
                        });
                    } else {
                        if (
                            !(
                                relField instanceof MutationOperationField &&
                                relField.mutationOperation instanceof UnwindCreateOperation
                            )
                        ) {
                            throw new Error(
                                `Transpile Error: Unwind create optimization failed when trying to hydrate nested level create operation for ${key}`
                            );
                        }
                        this.hydrateUnwindCreateOperation({
                            target: nestedEntity,
                            relationship: nestedRelationship,
                            input: nestedCreateInput,
                            unwindCreate: relField.mutationOperation,
                            context,
                        });
                    }
                } else {
                    throw new Error(`Transpile Error: Input field ${key} not found in entity ${target.name}`);
                }
            }
            if (relationship) {
                // do it for edge properties
                for (const key of Object.keys(this.getInputEdge(inputItem))) {
                    const attribute = relationship.attributes.get(key);
                    if (attribute) {
                        this.addAttributeInputFieldToUnwindOperation({
                            entity: target,
                            attribute,
                            unwindCreate,
                            context,
                            path: unwindCreate.getUnwindVariable().property("edge").property(key),
                            attachedTo: "relationship",
                        });
                    }
                }
            }
        });
    }
    private getInputNode(inputItem: Record<string, any>, isNested: boolean): Record<string, any> {
        if (isNested) {
            return inputItem.node ?? {};
        }
        return inputItem;
    }

    private getInputEdge(inputItem: Record<string, any>): Record<string, any> {
        return inputItem.edge ?? {};
    }

    private addAutogeneratedFields({
        entity,
        relationship,
        unwindCreate,
    }: {
        entity: ConcreteEntityAdapter;
        relationship?: RelationshipAdapter;
        unwindCreate: UnwindCreateOperation;
    }): void {
        [entity, relationship].forEach((entityOrRel: ConcreteEntityAdapter | RelationshipAdapter | undefined) => {
            if (!entityOrRel) {
                return;
            }

            const attachedTo = isConcreteEntity(entityOrRel) ? "node" : "relationship";
            entityOrRel.attributes.forEach((attribute) => {
                if (unwindCreate.getField(attribute.name, attachedTo)) {
                    return;
                }
                if (attribute.timestampCreateIsGenerated()) {
                    const inputField = new TimestampField(attribute.name, attribute, attachedTo);
                    unwindCreate.addField(inputField, attachedTo);
                }
                if (attribute.annotations.id) {
                    const inputField = new IdField(attribute.name, attribute, attachedTo);
                    unwindCreate.addField(inputField, attachedTo);
                }
            });
        });
    }

    private addAttributeInputFieldToUnwindOperation({
        entity,
        attribute,
        unwindCreate,
        context,
        path,
        attachedTo,
    }: {
        entity: ConcreteEntityAdapter;
        attribute: AttributeAdapter;
        unwindCreate: UnwindCreateOperation;
        context: Neo4jGraphQLTranslationContext;
        path: Cypher.Property;
        attachedTo: "relationship" | "node";
    }): void {
        if (unwindCreate.getField(attribute.name, attachedTo)) {
            return;
        }
        this.addAttributeAuthorization({
            attribute,
            entity,
            context,
            unwindCreate,
            conditionForEvaluation: Cypher.isNotNull(path),
        });
        const inputField = new ReferenceInputField({
            attribute,
            reference: path,
            attachedTo,
        });

        unwindCreate.addField(inputField, attachedTo);
    }

    private addRelationshipInputFieldToUnwindOperation({
        relationship,
        unwindCreate,
        context,
        path,
        nestedCreateInput,
    }: {
        relationship: RelationshipAdapter;
        unwindCreate: UnwindCreateOperation;
        context: Neo4jGraphQLTranslationContext;
        path: Cypher.Property;
        nestedCreateInput: Record<string, any>[];
    }): void {
        const relField = unwindCreate.getField(relationship.name, "node");
        if (!relField) {
            if (nestedCreateInput) {
                const nestedUnwind = this.parseUnwindCreate({
                    target: relationship.target as ConcreteEntityAdapter,
                    relationship: relationship,
                    input: nestedCreateInput,
                    unwindVariable: path,
                    context,
                });
                const mutationOperationField = new MutationOperationField(relationship.name, nestedUnwind);
                unwindCreate.addField(mutationOperationField, "node");
            } else {
                throw new Error(`Expected create operation, but found: ${relationship.name}`);
            }
        }
    }

    private addEntityAuthorization({
        entity,
        context,
        unwindCreate,
    }: {
        entity: ConcreteEntityAdapter;
        context: Neo4jGraphQLTranslationContext;
        unwindCreate: UnwindCreateOperation;
    }): void {
        const authFilters = this.queryASTFactory.authorizationFactory.createAuthValidateRule({
            entity,
            authAnnotation: entity.annotations.authorization,
            when: "AFTER",
            operations: ["CREATE"],
            context,
        });
        if (authFilters) {
            unwindCreate.addAuthFilters(authFilters);
        }
    }

    private addAttributeAuthorization({
        attribute,
        context,
        unwindCreate,
        entity,
        conditionForEvaluation,
    }: {
        attribute: AttributeAdapter;
        context: Neo4jGraphQLTranslationContext;
        unwindCreate: UnwindCreateOperation;
        entity: ConcreteEntityAdapter;
        conditionForEvaluation?: Cypher.Predicate;
    }): void {
        const attributeAuthorization = this.queryASTFactory.authorizationFactory.createAuthValidateRule({
            entity,
            when: "AFTER",
            authAnnotation: attribute.annotations.authorization,
            conditionForEvaluation,
            operations: ["CREATE"],
            context,
        });
        if (attributeAuthorization) {
            unwindCreate.addAuthFilters(attributeAuthorization);
        }
    }
}
