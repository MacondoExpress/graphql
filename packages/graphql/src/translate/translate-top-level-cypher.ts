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

import type { CypherField } from "../types";
import { DEBUG_TRANSLATE } from "../constants";
import Cypher from "@neo4j/cypher-builder";
import { applyAuthentication } from "./authorization/utils/apply-authentication";
import type { Neo4jGraphQLTranslationContext } from "../types/neo4j-graphql-translation-context";
import Debug from "debug";
import { QueryASTEnv, QueryASTContext } from "./queryAST/ast/QueryASTContext";
import { QueryASTFactory } from "./queryAST/factory/QueryASTFactory";
import { UnionEntityAdapter } from "../schema-model/entity/model-adapters/UnionEntityAdapter";
import { UnionEntity } from "../schema-model/entity/UnionEntity";
import { InterfaceEntity } from "../schema-model/entity/InterfaceEntity";
import { InterfaceEntityAdapter } from "../schema-model/entity/model-adapters/InterfaceEntityAdapter";
import type { Entity } from "../schema-model/entity/Entity";
import type { EntityAdapter } from "../schema-model/entity/EntityAdapter";
import { ConcreteEntityAdapter } from "../schema-model/entity/model-adapters/ConcreteEntityAdapter";

const debug = Debug(DEBUG_TRANSLATE);

export function translateTopLevelCypher({
    context,
    field,
    type,
}: {
    context: Neo4jGraphQLTranslationContext;
    field: CypherField;

    type: "Query" | "Mutation";
}): Cypher.CypherResult {
    const operation = context.schemaModel.operations[type];
    if (!operation) {
        throw new Error(`Failed to find operation ${type} in Schema Model.`);
    }
    const operationField = operation.findAttribute(field.fieldName);
    if (!operationField) {
        throw new Error(`Failed to find field ${field.fieldName} on operation ${type}.`);
    }
    const entity = context.schemaModel.entities.get(field.typeMeta.name);

    const annotation = operationField.annotations.authentication;
    if (annotation) {
        applyAuthentication({ context, annotation });
    }
    const { resolveTree } = context;

    // entity could be undefined as the field could be a scalar
    const entityAdapter = entity && getEntityAdapter(entity);

    const queryAST = new QueryASTFactory(context.schemaModel, false).createQueryAST({
        resolveTree,
        entityAdapter,
        context,
    });
    const queryASTEnv = new QueryASTEnv();
    const targetNode = new Cypher.NamedNode("this");
    const queryASTContext = new QueryASTContext({
        target: targetNode,
        env: queryASTEnv,
        neo4jGraphQLContext: context,
        returnVariable: targetNode,
        shouldCollect: false,
        shouldDistinct: false,
    });
    debug(queryAST.print());
    const queryASTResult = queryAST.transpile(queryASTContext);

    const projectionStatements = queryASTResult.clauses.length
        ? Cypher.concat(...queryASTResult.clauses)
        : new Cypher.Return(new Cypher.Literal("Query cannot conclude with CALL"));
    return projectionStatements.build();
}

function getEntityAdapter(entity: Entity): EntityAdapter {
    if (entity instanceof UnionEntity) {
        return new UnionEntityAdapter(entity);
    }
    if (entity instanceof InterfaceEntity) {
        return new InterfaceEntityAdapter(entity);
    }
    if (entity.isConcreteEntity()) {
        return new ConcreteEntityAdapter(entity);
    }
    throw new Error(`Error while trying to build Entity: ${entity.name}`);
}
