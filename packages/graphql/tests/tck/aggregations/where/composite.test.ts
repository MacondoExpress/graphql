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

import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";
import { Neo4jGraphQL } from "../../../../src";
import { formatCypher, translateQuery, formatParams } from "../../utils/tck-test-utils";

describe("Cypher Aggregations where with count and node", () => {
    let typeDefs: DocumentNode;
    let neoSchema: Neo4jGraphQL;

    beforeAll(() => {
        typeDefs = gql`
            type User {
                name: String!
            }

            type Post {
                content: String!
                likes: [User!]! @relationship(type: "LIKES", direction: IN, properties: "Likes")
            }

            interface Likes @relationshipProperties {
                someString: String
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
    });

    test("Equality Count and node", async () => {
        const query = gql`
            {
                posts(where: { likesAggregate: { count: 10, node: { name_EQUAL: "potato" } } }) {
                    content
                }
            }
        `;

        const result = await translateQuery(neoSchema, query);

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "MATCH (this:Post)
            CALL {
                WITH this
                MATCH (this)<-[this0:LIKES]-(this1:User)
                RETURN count(this1) = $param0 AS var2, any(var3 IN collect(this1.name) WHERE var3 = $param1) AS var4
            }
            WITH *
            WHERE (var2 = true AND var4 = true)
            RETURN this { .content } AS this"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"param0\\": {
                    \\"low\\": 10,
                    \\"high\\": 0
                },
                \\"param1\\": \\"potato\\"
            }"
        `);
    });

    test("Equality Count, node and edge", async () => {
        const query = gql`
            {
                posts(
                    where: {
                        likesAggregate: { count: 10, node: { name_EQUAL: "potato" }, edge: { someString_EQUAL: "10" } }
                    }
                ) {
                    content
                }
            }
        `;

        const result = await translateQuery(neoSchema, query);

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "MATCH (this:Post)
            CALL {
                WITH this
                MATCH (this)<-[this0:LIKES]-(this1:User)
                RETURN count(this1) = $param0 AS var2, any(var3 IN collect(this1.name) WHERE var3 = $param1) AS var4, any(var5 IN collect(this0.someString) WHERE var5 = $param2) AS var6
            }
            WITH *
            WHERE (var2 = true AND var4 = true AND var6 = true)
            RETURN this { .content } AS this"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"param0\\": {
                    \\"low\\": 10,
                    \\"high\\": 0
                },
                \\"param1\\": \\"potato\\",
                \\"param2\\": \\"10\\"
            }"
        `);
    });

    test("Equality Count, node, edge and logical", async () => {
        const query = gql`
            {
                posts(
                    where: {
                        likesAggregate: {
                            count: 10
                            node: { name_EQUAL: "potato" }
                            edge: { someString_EQUAL: "10" }
                            AND: [{ count_GT: 10 }, { count_LT: 20 }]
                        }
                    }
                ) {
                    content
                }
            }
        `;

        const result = await translateQuery(neoSchema, query);

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "MATCH (this:Post)
            CALL {
                WITH this
                MATCH (this)<-[this0:LIKES]-(this1:User)
                RETURN count(this1) = $param0 AS var2, count(this1) > $param1 AS var3, count(this1) < $param2 AS var4, any(var5 IN collect(this1.name) WHERE var5 = $param3) AS var6, any(var7 IN collect(this0.someString) WHERE var7 = $param4) AS var8
            }
            WITH *
            WHERE (var2 = true AND (var3 = true AND var4 = true) AND var6 = true AND var8 = true)
            RETURN this { .content } AS this"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"param0\\": {
                    \\"low\\": 10,
                    \\"high\\": 0
                },
                \\"param1\\": {
                    \\"low\\": 10,
                    \\"high\\": 0
                },
                \\"param2\\": {
                    \\"low\\": 20,
                    \\"high\\": 0
                },
                \\"param3\\": \\"potato\\",
                \\"param4\\": \\"10\\"
            }"
        `);
    });
});
