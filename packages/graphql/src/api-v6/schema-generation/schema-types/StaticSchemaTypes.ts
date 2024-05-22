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

import { GraphQLFloat, GraphQLID, GraphQLInt, GraphQLString } from "graphql";
import type { EnumTypeComposer, InputTypeComposer, ObjectTypeComposer } from "graphql-compose";
import { Memoize } from "typescript-memoize";
import type { SchemaBuilder } from "../SchemaBuilder";

function nonNull(type: string): string {
    return `${type}!`;
}

function list(type: string): string {
    return `[${type}]`;
}

export class StaticSchemaTypes {
    private schemaBuilder: SchemaBuilder;

    constructor({ schemaBuilder }: { schemaBuilder: SchemaBuilder }) {
        this.schemaBuilder = schemaBuilder;
    }

    public get pageInfo(): ObjectTypeComposer {
        return this.schemaBuilder.getOrCreateObjectType("PageInfo", () => {
            return { fields: { hasNextPage: "Boolean", hasPreviousPage: "Boolean" } };
        });
    }

    @Memoize()
    public get sortDirection(): EnumTypeComposer {
        return this.schemaBuilder.createEnumType("SortDirection", ["ASC", "DESC"]);
    }

    public getStringListWhere(nullable: boolean): InputTypeComposer {
        if (nullable) {
            return this.schemaBuilder.getOrCreateInputType("StringListWhereNullable", () => {
                return {
                    fields: {
                        equals: "[String]",
                    },
                };
            });
        }

        return this.schemaBuilder.getOrCreateInputType("StringListWhere", () => {
            return {
                fields: {
                    equals: "[String!]",
                },
            };
        });
    }

    public get stringWhere(): InputTypeComposer {
        return this.schemaBuilder.getOrCreateInputType("StringWhere", (itc) => {
            return {
                fields: {
                    OR: itc.NonNull.List,
                    AND: itc.NonNull.List,
                    NOT: itc,
                    equals: GraphQLString,
                    in: list(nonNull(GraphQLString.name)),
                    matches: GraphQLString,
                    contains: GraphQLString,
                    startsWith: GraphQLString,
                    endsWith: GraphQLString,
                },
            };
        });
    }

    public getIdListWhere(nullable: boolean): InputTypeComposer {
        if (nullable) {
            return this.schemaBuilder.getOrCreateInputType("IDListWhereNullable", (itc) => {
                return {
                    fields: {
                        equals: "[String]",
                    },
                };
            });
        }

        return this.schemaBuilder.getOrCreateInputType("IDListWhere", () => {
            return {
                fields: {
                    equals: "[String!]",
                },
            };
        });
    }

    public get idWhere(): InputTypeComposer {
        return this.schemaBuilder.getOrCreateInputType("IDWhere", (itc) => {
            return {
                fields: {
                    OR: itc.NonNull.List,
                    AND: itc.NonNull.List,
                    NOT: itc,
                    equals: GraphQLID,
                    in: list(nonNull(GraphQLID.name)),
                    matches: GraphQLID,
                    contains: GraphQLID,
                    startsWith: GraphQLID,
                    endsWith: GraphQLID,
                },
            };
        });
    }

    public getIntListWhere(nullable: boolean): InputTypeComposer {
        if (nullable) {
            return this.schemaBuilder.getOrCreateInputType("IntListWhereNullable", (itc) => {
                return {
                    fields: {
                        equals: "[Int]",
                    },
                };
            });
        }

        return this.schemaBuilder.getOrCreateInputType("IntListWhere", () => {
            return {
                fields: {
                    equals: "[Int!]",
                },
            };
        });
    }

    public get intWhere(): InputTypeComposer {
        return this.schemaBuilder.getOrCreateInputType("IntWhere", (itc) => {
            return {
                fields: {
                    OR: itc.NonNull.List,
                    AND: itc.NonNull.List,
                    NOT: itc,
                    equals: GraphQLInt,
                    in: list(nonNull(GraphQLInt.name)),
                    lt: GraphQLInt,
                    lte: GraphQLInt,
                    gt: GraphQLInt,
                    gte: GraphQLInt,
                },
            };
        });
    }

    public getFloatListWhere(nullable: boolean): InputTypeComposer {
        if (nullable) {
            return this.schemaBuilder.getOrCreateInputType("FloatListWhereNullable", (itc) => {
                return {
                    fields: {
                        equals: "[Float]",
                    },
                };
            });
        }

        return this.schemaBuilder.getOrCreateInputType("FloatListWhere", () => {
            return {
                fields: {
                    equals: "[Float!]",
                },
            };
        });
    }

    public get floatWhere(): InputTypeComposer {
        return this.schemaBuilder.getOrCreateInputType("FloatWhere", (itc) => {
            return {
                fields: {
                    OR: itc.NonNull.List,
                    AND: itc.NonNull.List,
                    NOT: itc,
                    equals: GraphQLFloat,
                    in: list(nonNull(GraphQLFloat.name)),
                    lt: GraphQLFloat,
                    lte: GraphQLFloat,
                    gt: GraphQLFloat,
                    gte: GraphQLFloat,
                },
            };
        });
    }

    // private getListWhereFields(itc: InputTypeComposer, targetType: InputTypeComposer): Record<string, any> {
    //     return {
    //         OR: itc.NonNull.List,
    //         AND: itc.NonNull.List,
    //         NOT: itc,
    //         all: targetType,
    //         none: targetType,
    //         single: targetType,
    //         some: targetType,
    //     };
    // }
}