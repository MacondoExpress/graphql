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

import { gql } from "apollo-server";
import { DocumentNode } from "graphql";
import { Neo4jGraphQL } from "../../../../src";
import { createJwtRequest } from "../../../utils/create-jwt-request";
import { formatCypher, translateQuery, formatParams } from "../../utils/tck-test-utils";

describe("https://github.com/neo4j/graphql/issues/901", () => {
    let typeDefs: DocumentNode;
    let neoSchema: Neo4jGraphQL;

    beforeAll(() => {
        typeDefs = gql`
            type Series {
                id: ID! @id
                name: String!
                brand: Series @relationship(type: "HAS_BRAND", direction: OUT, properties: "Properties")
                manufacturer: Series @relationship(type: "HAS_MANUFACTURER", direction: OUT, properties: "Properties")
            }

            interface Properties {
                current: Boolean
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
            config: { enableRegex: true },
        });
    });

    test("conjuctions", async () => {
        const query = gql`
            query ($where: SeriesWhere) {
                series(where: $where) {
                    name
                    brand {
                        name
                    }
                    manufacturer {
                        name
                    }
                }
            }
        `;

        const req = createJwtRequest("secret", {});
        const result = await translateQuery(neoSchema, query, {
            req,
            variableValues: {
                where: {
                    OR: [
                        {
                            manufacturerConnection: {
                                edge: {
                                    current: true,
                                },
                                node: {
                                    name: "abc",
                                },
                            },
                        },
                        {
                            brandConnection: {
                                edge: {
                                    current: true,
                                },
                                node: {
                                    name: "smart",
                                },
                            },
                        },
                    ],
                },
            },
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "MATCH (this:\`Series\`)
            WHERE ((exists((this)-[:\`HAS_MANUFACTURER\`]->(:\`Series\`))
            AND ANY(var3 IN [(this)-[this1:\`HAS_MANUFACTURER\`]->(this2:\`Series\`) | { node: this2, relationship: this1 }]
                        WHERE var3.relationship.current = $nestedParam0.edge.current AND var3.node.name = $nestedParam0.node.name))
            OR (exists((this)-[:\`HAS_BRAND\`]->(:\`Series\`))
            AND ANY(var6 IN [(this)-[this4:\`HAS_BRAND\`]->(this5:\`Series\`) | { node: this5, relationship: this4 }]
                        WHERE var6.relationship.current = $nestedParam1.edge.current AND var6.node.name = $nestedParam1.node.name)))
            RETURN this { .name, brand: head([ (this)-[:HAS_BRAND]->(this_brand:Series)   | this_brand { .name } ]), manufacturer: head([ (this)-[:HAS_MANUFACTURER]->(this_manufacturer:Series)   | this_manufacturer { .name } ]) } as this"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"nestedParam0\\": {
                    \\"edge\\": {
                        \\"current\\": true
                    },
                    \\"node\\": {
                        \\"name\\": \\"abc\\"
                    }
                },
                \\"nestedParam1\\": {
                    \\"edge\\": {
                        \\"current\\": true
                    },
                    \\"node\\": {
                        \\"name\\": \\"smart\\"
                    }
                }
            }"
        `);
    });
});
