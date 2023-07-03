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

describe("Cypher Where Aggregations with @node directive", () => {
    let typeDefs: DocumentNode;
    let neoSchema: Neo4jGraphQL;

    beforeAll(() => {
        typeDefs = gql`
            type User @query(aggregate: true) @node(labels: ["_User", "additionalUser"]) {
                someName: String
            }

            type Post @query(aggregate: true) @node(labels: ["_Post", "additionalPost"]) {
                content: String!
                likes: [User!]! @relationship(type: "LIKES", direction: IN, aggregate: true)
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
    });

    test("GT with node directive", async () => {
        const query = gql`
            {
                posts(where: { likesAggregate: { node: { someName_GT: 1 } } }) {
                    content
                }
            }
        `;

        const result = await translateQuery(neoSchema, query);

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "MATCH (this:\`_Post\`:\`additionalPost\`)
            CALL {
                WITH this
                MATCH (this)<-[this0:\`LIKES\`]-(this1:\`_User\`:\`additionalUser\`)
                RETURN any(var2 IN collect(size(this1.someName)) WHERE var2 > $param0) AS var3
            }
            WITH *
            WHERE var3 = true
            RETURN this { .content } AS this"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"param0\\": {
                    \\"low\\": 1,
                    \\"high\\": 0
                }
            }"
        `);
    });
});
