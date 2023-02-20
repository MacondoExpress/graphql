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

import type { Node } from "../classes";
import createProjectionAndParams from "./create-projection-and-params";
import createCreateAndParams from "./create-create-and-params";
import type { Context } from "../types";
import { AUTH_FORBIDDEN_ERROR, META_CYPHER_VARIABLE } from "../constants";
import { filterTruthy } from "../utils/utils";
import { CallbackBucket } from "../classes/CallbackBucket";
import Cypher from "@neo4j/cypher-builder";
import unwindCreate from "./unwind-create";
import { UnsupportedUnwindOptimization } from "./batch-create/types";

export default async function translateCreate({
    context,
    node,
}: {
    context: Context;
    node: Node;
}): Promise<{ cypher: string; params: Record<string, any> }> {
    try {
        return await unwindCreate({ context, node });
    } catch (error) {
        if (!(error instanceof UnsupportedUnwindOptimization)) {
            throw error;
        }
    }

    const { resolveTree } = context;
    const mutationInputs = resolveTree.args.input as any[];

    const connectionStrs: string[] = [];
    const interfaceStrs: string[] = [];
    const projectionWith: string[] = [];
    const callbackBucket: CallbackBucket = new CallbackBucket(context);

    let connectionParams: any;
    let interfaceParams: any;

    const mutationResponse = resolveTree.fieldsByTypeName[node.mutationResponseTypeNames.create];

    const nodeProjection = Object.values(mutationResponse).find((field) => field.name === node.plural);
    const metaNames: string[] = [];

    const { createStrs, params } = mutationInputs.reduce(
        (res, input, index) => {
            const varName = `this${index}`;
            const create = [`CALL {`];
            const withVars = [varName];
            projectionWith.push(varName);

            if (context.subscriptionsEnabled) {
                create.push(`WITH [] AS ${META_CYPHER_VARIABLE}`);
                withVars.push(META_CYPHER_VARIABLE);
            }

            const createAndParams = createCreateAndParams({
                input,
                node,
                context,
                varName,
                withVars,
                includeRelationshipValidation: true,
                topLevelNodeVariable: varName,
                callbackBucket,
            });
            create.push(`${createAndParams[0]}`);

            if (context.subscriptionsEnabled) {
                const metaVariable = `${varName}_${META_CYPHER_VARIABLE}`;
                create.push(`RETURN ${varName}, ${META_CYPHER_VARIABLE} AS ${metaVariable}`);
                metaNames.push(metaVariable);
            } else {
                create.push(`RETURN ${varName}`);
            }

            create.push(`}`);
            res.createStrs.push(create.join("\n"));
            res.params = { ...res.params, ...createAndParams[1] };
            return res;
        },
        { createStrs: [], params: {}, withVars: [] }
    ) as {
        createStrs: string[];
        params: any;
    };

    let replacedProjectionParams: Record<string, unknown> = {};
    let projectionExpr: Cypher.Expr | undefined;
    let authCalls: Cypher.Expr | undefined;

    if (metaNames.length > 0) {
        projectionWith.push(`${metaNames.join(" + ")} AS meta`);
    }

    let projectionSubquery: Cypher.Clause | undefined;
    if (nodeProjection) {
        let projAuth: Cypher.Clause | undefined = undefined;
        const projection = createProjectionAndParams({
            node,
            context,
            resolveTree: nodeProjection,
            varName: new Cypher.NamedNode("REPLACE_ME"),
        });

        projectionSubquery = Cypher.concat(...projection.subqueriesBeforeSort, ...projection.subqueries);
        if (projection.meta?.authValidatePredicates?.length) {
            projAuth = new Cypher.CallProcedure(
                new Cypher.apoc.Validate(
                    Cypher.not(Cypher.and(...projection.meta.authValidatePredicates)),
                    AUTH_FORBIDDEN_ERROR,
                    new Cypher.Literal([0])
                )
            );
        }

        replacedProjectionParams = Object.entries(projection.params).reduce((res, [key, value]) => {
            return { ...res, [key.replace("REPLACE_ME", "projection")]: value };
        }, {});

        projectionExpr = new Cypher.RawCypher((env) => {
            return createStrs
                .map(
                    (_, i) =>
                        `\nthis${i} ${projection.projection
                            .getCypher(env)
                            // First look to see if projection param is being reassigned
                            // e.g. in an apoc.cypher.runFirstColumn function call used in createProjection->connectionField
                            .replace(/REPLACE_ME(?=\w+: \$REPLACE_ME)/g, "projection")
                            .replace(/\$REPLACE_ME/g, "$projection")
                            .replace(/REPLACE_ME/g, `this${i}`)}`
                )
                .join(", ");
        });

        if (projAuth) {
            authCalls = new Cypher.RawCypher((env) =>
                createStrs
                    .map((_, i) =>
                        (projAuth as Cypher.Clause)
                            .getCypher(env)
                            .replace(/\$REPLACE_ME/g, "$projection")
                            .replace(/REPLACE_ME/g, `this${i}`)
                    )
                    .join("\n")
            );
        }
    }

    const replacedConnectionStrs = connectionStrs.length
        ? createStrs.map((_, i) => {
              return connectionStrs
                  .map((connectionStr) => {
                      return connectionStr.replace(/REPLACE_ME/g, `this${i}`);
                  })
                  .join("\n");
          })
        : [];

    // const replacedInterfaceStrs = interfaceStrs.length
    //     ? createStrs.map((_, i) => {
    //           return interfaceStrs
    //               .map((interfaceStr) => {
    //                   return interfaceStr.replace(/REPLACE_ME/g, `this${i}`);
    //               })
    //               .join("\n");
    //       })
    //     : [];

    const replacedConnectionParams = connectionParams
        ? createStrs.reduce((res1, _, i) => {
              return {
                  ...res1,
                  ...Object.entries(connectionParams).reduce((res2, [key, value]) => {
                      return { ...res2, [key.replace("REPLACE_ME", `this${i}`)]: value };
                  }, {}),
              };
          }, {})
        : {};

    const replacedInterfaceParams = interfaceParams
        ? createStrs.reduce((res1, _, i) => {
              return {
                  ...res1,
                  ...Object.entries(interfaceParams).reduce((res2, [key, value]) => {
                      return { ...res2, [key.replace("REPLACE_ME", `this${i}`)]: value };
                  }, {}),
              };
          }, {})
        : {};

    const returnStatement = generateCreateReturnStatement(projectionExpr, context.subscriptionsEnabled);
    const projectionWithStr = context.subscriptionsEnabled ? `WITH ${projectionWith.join(", ")}` : "";

    const createQuery = new Cypher.RawCypher((env) => {
        const projectionSubqueryStr = projectionSubquery ? `\n${projectionSubquery.getCypher(env)}` : "";
        // TODO: avoid REPLACE_ME
        const replacedProjectionSubqueryStrs = createStrs.length
            ? createStrs.map((_, i) => {
                  return projectionSubqueryStr
                      .replace(/REPLACE_ME(?=\w+: \$REPLACE_ME)/g, "projection")
                      .replace(/\$REPLACE_ME/g, "$projection")
                      .replace(/REPLACE_ME/g, `this${i}`);
              })
            : [];
        const cypher = filterTruthy([
            `${createStrs.join("\n")}`,
            projectionWithStr,
            authCalls?.getCypher(env),
            ...replacedConnectionStrs,
            // ...replacedInterfaceStrs,
            ...replacedProjectionSubqueryStrs,
            returnStatement.getCypher(env),
        ])
            .filter(Boolean)
            .join("\n");
        return [
            cypher,
            {
                ...params,
                ...replacedProjectionParams,
                ...replacedConnectionParams,
                ...replacedInterfaceParams,
            },
        ];
    });

    const createQueryCypher = createQuery.build("create_");
    const { cypher, params: resolvedCallbacks } = await callbackBucket.resolveCallbacksAndFilterCypher({
        cypher: createQueryCypher.cypher,
    });

    return {
        cypher,
        params: {
            ...createQueryCypher.params,
            resolvedCallbacks,
        },
    };
}
function generateCreateReturnStatement(
    projectionExpr: Cypher.Expr | undefined,
    subscriptionsEnabled: boolean
): Cypher.Clause {
    const statements = new Cypher.RawCypher((env) => {
        let statStr;
        if (projectionExpr) {
            statStr = `[${projectionExpr.getCypher(env)}] AS data`;
        }

        if (subscriptionsEnabled) {
            statStr = statStr ? `${statStr}, ${META_CYPHER_VARIABLE}` : META_CYPHER_VARIABLE;
        }

        if (!statStr) {
            statStr = "'Query cannot conclude with CALL'";
        }
        return statStr;
    });

    return new Cypher.Return(statements);
}
