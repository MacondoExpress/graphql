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

import { Neo4jGraphQL } from "../../../../src";
import { createBearerToken } from "../../../utils/create-bearer-token";
import { formatCypher, translateQuery } from "../../utils/tck-test-utils";
import { testVector } from "./shared-vector";

const queryName = "moviesVectorQuery";
const secret = "shh-its-a-secret";
const sub = "my-sub";
const token = createBearerToken(secret, { sub });

describe("Cypher -> vector -> Auth", () => {
    let verifyTCK;

    beforeAll(() => {
        // NOTE: tck verification is skipped for vector tests as vector is not supported on Neo4j 4.x
        if (process.env.VERIFY_TCK) {
            verifyTCK = process.env.VERIFY_TCK;
            delete process.env.VERIFY_TCK;
        }
    });

    afterAll(() => {
        if (verifyTCK) {
            process.env.VERIFY_TCK = verifyTCK;
        }
    });

    test("simple match with auth where", async () => {
        const typeDefs = /* GraphQL */ `
            type Movie
                @node
                @vector(indexes: [{ indexName: "movie_index", embeddingProperty: "movieVector", queryName: "${queryName}" }])
                @authorization(filter: [{ where: { node: { director_SOME: { id_EQ: "$jwt.sub" } } } }]) {
                title: String
                director: [Person!]! @relationship(type: "DIRECTED", direction: IN)
            }

            type Person @node {
                id: ID
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: { authorization: { key: secret } },
        });

        const query = /* GraphQL */ `
            query MovieVectorQuery($vector: [Float!]!) {
                ${queryName}(vector: $vector) {
                    edges {
                        node {
                            title
                        }
                    }
                }
            }
        `;

        const result = await translateQuery(neoSchema, query, {
            token,
            variableValues: {
                vector: testVector,
            },
            neo4jVersion: "5",
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL db.index.vector.queryNodes(\\"movie_index\\", 4, $param0) YIELD node AS this0, score AS var1
            WHERE ($param1 IN labels(this0) AND ($isAuthenticated = true AND EXISTS {
                MATCH (this0)<-[:DIRECTED]-(this2:Person)
                WHERE ($jwt.sub IS NOT NULL AND this2.id = $jwt.sub)
            }))
            WITH collect({ node: this0 }) AS edges
            WITH edges, size(edges) AS totalCount
            CALL {
                WITH edges
                UNWIND edges AS edge
                WITH edge.node AS this0
                RETURN collect({ node: { title: this0.title, __resolveType: \\"Movie\\" } }) AS var3
            }
            RETURN { edges: var3, totalCount: totalCount } AS this"
        `);

        expect(result.params).toMatchInlineSnapshot(`
            Object {
              "isAuthenticated": true,
              "jwt": Object {
                "roles": Array [],
                "sub": "my-sub",
              },
              "param0": Array [
                0.57728399,
                0.8260711,
                -0.18943521,
                -0.86630089,
                0.50722141,
                0.9413647,
                -0.00287237,
                0.5678057,
                -0.34498478,
                0.62378039,
                -0.17022743,
                0.84307471,
                0.83325899,
                -0.36753407,
                0.7642778,
                0.82613028,
                -0.16147488,
                -0.88113195,
                -0.25712598,
                0.17258664,
                0.63981952,
                0.52201768,
                -0.28939083,
                -0.85470267,
                0.62796275,
                0.19119759,
                -0.10786322,
                -0.71178741,
                0.16297122,
                -0.5236891,
                0.02301018,
                0.19934932,
                -0.20613451,
                -0.09630034,
                0.71799613,
                0.00802349,
                0.16620695,
                0.99894364,
                0.84095019,
                0.49911925,
                0.1868809,
                0.59355553,
                0.52967388,
                0.10423087,
                0.06609644,
                0.82136386,
                0.47898197,
                0.13019541,
                0.67751487,
                0.30949429,
                -0.54260053,
                0.88476482,
                -0.48187063,
                0.91694089,
                0.08032545,
                0.24976293,
                -0.0066078,
                -0.62484044,
                0.07914211,
                -0.80002603,
                -0.50121599,
                -0.97093072,
                0.95978468,
                0.18477219,
                -0.32575437,
                0.97763851,
                0.06296013,
                -0.23328443,
                0.79023972,
                -0.32595528,
                0.5578954,
                -0.94650406,
                -0.18724417,
                -0.04608709,
                -0.78561546,
                -0.25202331,
                -0.37463436,
                -0.33241845,
                0.11763381,
                -0.10055221,
                0.65539967,
                -0.84661474,
                0.88373379,
                -0.57329167,
                0.34545063,
                -0.72035787,
                -0.17781696,
                -0.18101958,
                0.1364994,
                -0.15453807,
                -0.41842143,
                -0.59314459,
                0.4448963,
                -0.41053446,
                -0.43375532,
                0.63044441,
                0.20762297,
                -0.35957381,
                -0.9894614,
                0.10915881,
                -0.07803859,
                0.29098689,
                0.47958243,
                0.25725614,
                -0.22877552,
                -0.45436423,
                0.63265844,
                -0.09687853,
                0.42960041,
                -0.52444649,
                -0.48323709,
                -0.99241219,
                0.94608191,
                -0.29829612,
                -0.59107999,
                -0.49592416,
                0.42438153,
                0.4650137,
                -0.2751502,
                0.0472371,
                0.18107815,
                0.91924594,
                -0.0928359,
                0.06657278,
                -0.83372123,
                0.87701374,
                -0.9729012,
                0.67098634,
              ],
              "param1": "Movie",
            }
        `);
    });

    test("simple match with auth allow", async () => {
        const typeDefs = /* GraphQL */ `
            type Movie
                @node
                @vector(indexes: [{ indexName: "movie_index", embeddingProperty: "movieVector", queryName: "${queryName}" }])
                @authorization(validate: [{ when: [BEFORE], where: { node: { director_SOME: { id_EQ: "$jwt.sub" } } } }]) {
                title: String
                director: [Person!]! @relationship(type: "DIRECTED", direction: IN)
            }

            type Person @node {
                id: ID
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: { authorization: { key: secret } },
        });

        const query = /* GraphQL */ `
            query MovieVectorQuery($vector: [Float!]!) {
                ${queryName}(vector: $vector) {
                    edges {
                        node {
                            title
                        }
                    }
                }
            }
        `;

        const result = await translateQuery(neoSchema, query, {
            token,
            variableValues: {
                vector: testVector,
            },
            neo4jVersion: "5",
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL db.index.vector.queryNodes(\\"movie_index\\", 4, $param0) YIELD node AS this0, score AS var1
            WHERE ($param1 IN labels(this0) AND apoc.util.validatePredicate(NOT ($isAuthenticated = true AND EXISTS {
                MATCH (this0)<-[:DIRECTED]-(this2:Person)
                WHERE ($jwt.sub IS NOT NULL AND this2.id = $jwt.sub)
            }), \\"@neo4j/graphql/FORBIDDEN\\", [0]))
            WITH collect({ node: this0 }) AS edges
            WITH edges, size(edges) AS totalCount
            CALL {
                WITH edges
                UNWIND edges AS edge
                WITH edge.node AS this0
                RETURN collect({ node: { title: this0.title, __resolveType: \\"Movie\\" } }) AS var3
            }
            RETURN { edges: var3, totalCount: totalCount } AS this"
        `);

        expect(result.params).toMatchInlineSnapshot(`
            Object {
              "isAuthenticated": true,
              "jwt": Object {
                "roles": Array [],
                "sub": "my-sub",
              },
              "param0": Array [
                0.57728399,
                0.8260711,
                -0.18943521,
                -0.86630089,
                0.50722141,
                0.9413647,
                -0.00287237,
                0.5678057,
                -0.34498478,
                0.62378039,
                -0.17022743,
                0.84307471,
                0.83325899,
                -0.36753407,
                0.7642778,
                0.82613028,
                -0.16147488,
                -0.88113195,
                -0.25712598,
                0.17258664,
                0.63981952,
                0.52201768,
                -0.28939083,
                -0.85470267,
                0.62796275,
                0.19119759,
                -0.10786322,
                -0.71178741,
                0.16297122,
                -0.5236891,
                0.02301018,
                0.19934932,
                -0.20613451,
                -0.09630034,
                0.71799613,
                0.00802349,
                0.16620695,
                0.99894364,
                0.84095019,
                0.49911925,
                0.1868809,
                0.59355553,
                0.52967388,
                0.10423087,
                0.06609644,
                0.82136386,
                0.47898197,
                0.13019541,
                0.67751487,
                0.30949429,
                -0.54260053,
                0.88476482,
                -0.48187063,
                0.91694089,
                0.08032545,
                0.24976293,
                -0.0066078,
                -0.62484044,
                0.07914211,
                -0.80002603,
                -0.50121599,
                -0.97093072,
                0.95978468,
                0.18477219,
                -0.32575437,
                0.97763851,
                0.06296013,
                -0.23328443,
                0.79023972,
                -0.32595528,
                0.5578954,
                -0.94650406,
                -0.18724417,
                -0.04608709,
                -0.78561546,
                -0.25202331,
                -0.37463436,
                -0.33241845,
                0.11763381,
                -0.10055221,
                0.65539967,
                -0.84661474,
                0.88373379,
                -0.57329167,
                0.34545063,
                -0.72035787,
                -0.17781696,
                -0.18101958,
                0.1364994,
                -0.15453807,
                -0.41842143,
                -0.59314459,
                0.4448963,
                -0.41053446,
                -0.43375532,
                0.63044441,
                0.20762297,
                -0.35957381,
                -0.9894614,
                0.10915881,
                -0.07803859,
                0.29098689,
                0.47958243,
                0.25725614,
                -0.22877552,
                -0.45436423,
                0.63265844,
                -0.09687853,
                0.42960041,
                -0.52444649,
                -0.48323709,
                -0.99241219,
                0.94608191,
                -0.29829612,
                -0.59107999,
                -0.49592416,
                0.42438153,
                0.4650137,
                -0.2751502,
                0.0472371,
                0.18107815,
                0.91924594,
                -0.0928359,
                0.06657278,
                -0.83372123,
                0.87701374,
                -0.9729012,
                0.67098634,
              ],
              "param1": "Movie",
            }
        `);
    });

    test("simple match with auth allow ALL", async () => {
        const typeDefs = /* GraphQL */ `
            type Movie
                @node
                @vector(indexes: [{ indexName: "movie_index", embeddingProperty: "movieVector", queryName: "${queryName}" }])
                @authorization(
                    validate: [{ when: [BEFORE], where: { node: { director_ALL: { id_EQ: "$jwt.sub" } } } }]
                ) {
                title: String
                director: [Person!]! @relationship(type: "DIRECTED", direction: IN)
            }

            type Person @node {
                id: ID
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: { authorization: { key: secret } },
        });

        const query = /* GraphQL */ `
            query MovieVectorQuery($vector: [Float!]!) {
                ${queryName}(vector: $vector) {
                    edges {
                        node {
                            title
                        }
                    }
                }
            }
        `;

        const result = await translateQuery(neoSchema, query, {
            token,
            variableValues: {
                vector: testVector,
            },
            neo4jVersion: "5",
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL db.index.vector.queryNodes(\\"movie_index\\", 4, $param0) YIELD node AS this0, score AS var1
            WHERE ($param1 IN labels(this0) AND apoc.util.validatePredicate(NOT ($isAuthenticated = true AND (EXISTS {
                MATCH (this0)<-[:DIRECTED]-(this2:Person)
                WHERE ($jwt.sub IS NOT NULL AND this2.id = $jwt.sub)
            } AND NOT (EXISTS {
                MATCH (this0)<-[:DIRECTED]-(this2:Person)
                WHERE NOT ($jwt.sub IS NOT NULL AND this2.id = $jwt.sub)
            }))), \\"@neo4j/graphql/FORBIDDEN\\", [0]))
            WITH collect({ node: this0 }) AS edges
            WITH edges, size(edges) AS totalCount
            CALL {
                WITH edges
                UNWIND edges AS edge
                WITH edge.node AS this0
                RETURN collect({ node: { title: this0.title, __resolveType: \\"Movie\\" } }) AS var3
            }
            RETURN { edges: var3, totalCount: totalCount } AS this"
        `);

        expect(result.params).toMatchInlineSnapshot(`
            Object {
              "isAuthenticated": true,
              "jwt": Object {
                "roles": Array [],
                "sub": "my-sub",
              },
              "param0": Array [
                0.57728399,
                0.8260711,
                -0.18943521,
                -0.86630089,
                0.50722141,
                0.9413647,
                -0.00287237,
                0.5678057,
                -0.34498478,
                0.62378039,
                -0.17022743,
                0.84307471,
                0.83325899,
                -0.36753407,
                0.7642778,
                0.82613028,
                -0.16147488,
                -0.88113195,
                -0.25712598,
                0.17258664,
                0.63981952,
                0.52201768,
                -0.28939083,
                -0.85470267,
                0.62796275,
                0.19119759,
                -0.10786322,
                -0.71178741,
                0.16297122,
                -0.5236891,
                0.02301018,
                0.19934932,
                -0.20613451,
                -0.09630034,
                0.71799613,
                0.00802349,
                0.16620695,
                0.99894364,
                0.84095019,
                0.49911925,
                0.1868809,
                0.59355553,
                0.52967388,
                0.10423087,
                0.06609644,
                0.82136386,
                0.47898197,
                0.13019541,
                0.67751487,
                0.30949429,
                -0.54260053,
                0.88476482,
                -0.48187063,
                0.91694089,
                0.08032545,
                0.24976293,
                -0.0066078,
                -0.62484044,
                0.07914211,
                -0.80002603,
                -0.50121599,
                -0.97093072,
                0.95978468,
                0.18477219,
                -0.32575437,
                0.97763851,
                0.06296013,
                -0.23328443,
                0.79023972,
                -0.32595528,
                0.5578954,
                -0.94650406,
                -0.18724417,
                -0.04608709,
                -0.78561546,
                -0.25202331,
                -0.37463436,
                -0.33241845,
                0.11763381,
                -0.10055221,
                0.65539967,
                -0.84661474,
                0.88373379,
                -0.57329167,
                0.34545063,
                -0.72035787,
                -0.17781696,
                -0.18101958,
                0.1364994,
                -0.15453807,
                -0.41842143,
                -0.59314459,
                0.4448963,
                -0.41053446,
                -0.43375532,
                0.63044441,
                0.20762297,
                -0.35957381,
                -0.9894614,
                0.10915881,
                -0.07803859,
                0.29098689,
                0.47958243,
                0.25725614,
                -0.22877552,
                -0.45436423,
                0.63265844,
                -0.09687853,
                0.42960041,
                -0.52444649,
                -0.48323709,
                -0.99241219,
                0.94608191,
                -0.29829612,
                -0.59107999,
                -0.49592416,
                0.42438153,
                0.4650137,
                -0.2751502,
                0.0472371,
                0.18107815,
                0.91924594,
                -0.0928359,
                0.06657278,
                -0.83372123,
                0.87701374,
                -0.9729012,
                0.67098634,
              ],
              "param1": "Movie",
            }
        `);
    });

    test("simple match with auth allow on connection node", async () => {
        const typeDefs = /* GraphQL */ `
            type Movie
                @node
                @vector(indexes: [{ indexName: "movie_index", embeddingProperty: "movieVector", queryName: "${queryName}" }])
                @authorization(
                    validate: [
                        { when: [BEFORE], where: { node: { directorConnection_SOME: { node: { id_EQ: "$jwt.sub" } } } } }
                    ]
                ) {
                title: String
                director: [Person!]! @relationship(type: "DIRECTED", direction: IN)
            }

            type Person @node {
                id: ID
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: { authorization: { key: secret } },
        });

        const query = /* GraphQL */ `
            query MovieVectorQuery($vector: [Float!]!) {
                ${queryName}(vector: $vector) {
                    edges {
                        node {
                            title
                        }
                    }
                }
            }
        `;

        const result = await translateQuery(neoSchema, query, {
            token,
            variableValues: {
                vector: testVector,
            },
            neo4jVersion: "5",
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL db.index.vector.queryNodes(\\"movie_index\\", 4, $param0) YIELD node AS this0, score AS var1
            WHERE ($param1 IN labels(this0) AND apoc.util.validatePredicate(NOT ($isAuthenticated = true AND EXISTS {
                MATCH (this0)<-[this2:DIRECTED]-(this3:Person)
                WHERE ($jwt.sub IS NOT NULL AND this3.id = $jwt.sub)
            }), \\"@neo4j/graphql/FORBIDDEN\\", [0]))
            WITH collect({ node: this0 }) AS edges
            WITH edges, size(edges) AS totalCount
            CALL {
                WITH edges
                UNWIND edges AS edge
                WITH edge.node AS this0
                RETURN collect({ node: { title: this0.title, __resolveType: \\"Movie\\" } }) AS var4
            }
            RETURN { edges: var4, totalCount: totalCount } AS this"
        `);

        expect(result.params).toMatchInlineSnapshot(`
            Object {
              "isAuthenticated": true,
              "jwt": Object {
                "roles": Array [],
                "sub": "my-sub",
              },
              "param0": Array [
                0.57728399,
                0.8260711,
                -0.18943521,
                -0.86630089,
                0.50722141,
                0.9413647,
                -0.00287237,
                0.5678057,
                -0.34498478,
                0.62378039,
                -0.17022743,
                0.84307471,
                0.83325899,
                -0.36753407,
                0.7642778,
                0.82613028,
                -0.16147488,
                -0.88113195,
                -0.25712598,
                0.17258664,
                0.63981952,
                0.52201768,
                -0.28939083,
                -0.85470267,
                0.62796275,
                0.19119759,
                -0.10786322,
                -0.71178741,
                0.16297122,
                -0.5236891,
                0.02301018,
                0.19934932,
                -0.20613451,
                -0.09630034,
                0.71799613,
                0.00802349,
                0.16620695,
                0.99894364,
                0.84095019,
                0.49911925,
                0.1868809,
                0.59355553,
                0.52967388,
                0.10423087,
                0.06609644,
                0.82136386,
                0.47898197,
                0.13019541,
                0.67751487,
                0.30949429,
                -0.54260053,
                0.88476482,
                -0.48187063,
                0.91694089,
                0.08032545,
                0.24976293,
                -0.0066078,
                -0.62484044,
                0.07914211,
                -0.80002603,
                -0.50121599,
                -0.97093072,
                0.95978468,
                0.18477219,
                -0.32575437,
                0.97763851,
                0.06296013,
                -0.23328443,
                0.79023972,
                -0.32595528,
                0.5578954,
                -0.94650406,
                -0.18724417,
                -0.04608709,
                -0.78561546,
                -0.25202331,
                -0.37463436,
                -0.33241845,
                0.11763381,
                -0.10055221,
                0.65539967,
                -0.84661474,
                0.88373379,
                -0.57329167,
                0.34545063,
                -0.72035787,
                -0.17781696,
                -0.18101958,
                0.1364994,
                -0.15453807,
                -0.41842143,
                -0.59314459,
                0.4448963,
                -0.41053446,
                -0.43375532,
                0.63044441,
                0.20762297,
                -0.35957381,
                -0.9894614,
                0.10915881,
                -0.07803859,
                0.29098689,
                0.47958243,
                0.25725614,
                -0.22877552,
                -0.45436423,
                0.63265844,
                -0.09687853,
                0.42960041,
                -0.52444649,
                -0.48323709,
                -0.99241219,
                0.94608191,
                -0.29829612,
                -0.59107999,
                -0.49592416,
                0.42438153,
                0.4650137,
                -0.2751502,
                0.0472371,
                0.18107815,
                0.91924594,
                -0.0928359,
                0.06657278,
                -0.83372123,
                0.87701374,
                -0.9729012,
                0.67098634,
              ],
              "param1": "Movie",
            }
        `);
    });

    test("simple match with auth allow on connection node ALL", async () => {
        const typeDefs = /* GraphQL */ `
            type Movie
                @node
                @vector(indexes: [{ indexName: "movie_index", embeddingProperty: "movieVector", queryName: "${queryName}" }])
                @authorization(
                    validate: [
                        {
                            when: [BEFORE]
                            where: { node: { directorConnection_ALL: { node: { id_EQ: "$jwt.sub" } } } }
                        }
                    ]
                ) {
                title: String
                director: [Person!]! @relationship(type: "DIRECTED", direction: IN)
            }

            type Person @node {
                id: ID
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: { authorization: { key: secret } },
        });

        const query = /* GraphQL */ `
            query MovieVectorQuery($vector: [Float!]!) {
                ${queryName}(vector: $vector) {
                    edges {
                        node {
                            title
                        }
                    }
                }
            }
        `;

        const result = await translateQuery(neoSchema, query, {
            token,
            variableValues: {
                vector: testVector,
            },
            neo4jVersion: "5",
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL db.index.vector.queryNodes(\\"movie_index\\", 4, $param0) YIELD node AS this0, score AS var1
            WHERE ($param1 IN labels(this0) AND apoc.util.validatePredicate(NOT ($isAuthenticated = true AND (EXISTS {
                MATCH (this0)<-[this2:DIRECTED]-(this3:Person)
                WHERE ($jwt.sub IS NOT NULL AND this3.id = $jwt.sub)
            } AND NOT (EXISTS {
                MATCH (this0)<-[this2:DIRECTED]-(this3:Person)
                WHERE NOT ($jwt.sub IS NOT NULL AND this3.id = $jwt.sub)
            }))), \\"@neo4j/graphql/FORBIDDEN\\", [0]))
            WITH collect({ node: this0 }) AS edges
            WITH edges, size(edges) AS totalCount
            CALL {
                WITH edges
                UNWIND edges AS edge
                WITH edge.node AS this0
                RETURN collect({ node: { title: this0.title, __resolveType: \\"Movie\\" } }) AS var4
            }
            RETURN { edges: var4, totalCount: totalCount } AS this"
        `);

        expect(result.params).toMatchInlineSnapshot(`
            Object {
              "isAuthenticated": true,
              "jwt": Object {
                "roles": Array [],
                "sub": "my-sub",
              },
              "param0": Array [
                0.57728399,
                0.8260711,
                -0.18943521,
                -0.86630089,
                0.50722141,
                0.9413647,
                -0.00287237,
                0.5678057,
                -0.34498478,
                0.62378039,
                -0.17022743,
                0.84307471,
                0.83325899,
                -0.36753407,
                0.7642778,
                0.82613028,
                -0.16147488,
                -0.88113195,
                -0.25712598,
                0.17258664,
                0.63981952,
                0.52201768,
                -0.28939083,
                -0.85470267,
                0.62796275,
                0.19119759,
                -0.10786322,
                -0.71178741,
                0.16297122,
                -0.5236891,
                0.02301018,
                0.19934932,
                -0.20613451,
                -0.09630034,
                0.71799613,
                0.00802349,
                0.16620695,
                0.99894364,
                0.84095019,
                0.49911925,
                0.1868809,
                0.59355553,
                0.52967388,
                0.10423087,
                0.06609644,
                0.82136386,
                0.47898197,
                0.13019541,
                0.67751487,
                0.30949429,
                -0.54260053,
                0.88476482,
                -0.48187063,
                0.91694089,
                0.08032545,
                0.24976293,
                -0.0066078,
                -0.62484044,
                0.07914211,
                -0.80002603,
                -0.50121599,
                -0.97093072,
                0.95978468,
                0.18477219,
                -0.32575437,
                0.97763851,
                0.06296013,
                -0.23328443,
                0.79023972,
                -0.32595528,
                0.5578954,
                -0.94650406,
                -0.18724417,
                -0.04608709,
                -0.78561546,
                -0.25202331,
                -0.37463436,
                -0.33241845,
                0.11763381,
                -0.10055221,
                0.65539967,
                -0.84661474,
                0.88373379,
                -0.57329167,
                0.34545063,
                -0.72035787,
                -0.17781696,
                -0.18101958,
                0.1364994,
                -0.15453807,
                -0.41842143,
                -0.59314459,
                0.4448963,
                -0.41053446,
                -0.43375532,
                0.63044441,
                0.20762297,
                -0.35957381,
                -0.9894614,
                0.10915881,
                -0.07803859,
                0.29098689,
                0.47958243,
                0.25725614,
                -0.22877552,
                -0.45436423,
                0.63265844,
                -0.09687853,
                0.42960041,
                -0.52444649,
                -0.48323709,
                -0.99241219,
                0.94608191,
                -0.29829612,
                -0.59107999,
                -0.49592416,
                0.42438153,
                0.4650137,
                -0.2751502,
                0.0472371,
                0.18107815,
                0.91924594,
                -0.0928359,
                0.06657278,
                -0.83372123,
                0.87701374,
                -0.9729012,
                0.67098634,
              ],
              "param1": "Movie",
            }
        `);
    });

    test("simple match with auth allow on connection edge", async () => {
        const typeDefs = /* GraphQL */ `
            type Movie
                @node
                @vector(indexes: [{ indexName: "movie_index", embeddingProperty: "movieVector", queryName: "${queryName}" }])
                @authorization(
                    validate: [
                        { when: [BEFORE], where: { node: { directorConnection_SOME: { edge: { year_EQ: 2020 } } } } }
                    ]
                ) {
                title: String
                director: [Person!]! @relationship(type: "DIRECTED", direction: IN, properties: "Directed")
            }

            type Person @node {
                id: ID
            }

            type Directed @relationshipProperties {
                year: Int
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: { authorization: { key: secret } },
        });

        const query = /* GraphQL */ `
            query MovieVectorQuery($vector: [Float!]!) {
                ${queryName}(vector: $vector) {
                    edges {
                        node {
                            title
                        }
                    }
                }
            }
        `;

        const result = await translateQuery(neoSchema, query, {
            token,
            variableValues: {
                vector: testVector,
            },
            neo4jVersion: "5",
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL db.index.vector.queryNodes(\\"movie_index\\", 4, $param0) YIELD node AS this0, score AS var1
            WHERE ($param1 IN labels(this0) AND apoc.util.validatePredicate(NOT ($isAuthenticated = true AND EXISTS {
                MATCH (this0)<-[this2:DIRECTED]-(this3:Person)
                WHERE ($param3 IS NOT NULL AND this2.year = $param3)
            }), \\"@neo4j/graphql/FORBIDDEN\\", [0]))
            WITH collect({ node: this0 }) AS edges
            WITH edges, size(edges) AS totalCount
            CALL {
                WITH edges
                UNWIND edges AS edge
                WITH edge.node AS this0
                RETURN collect({ node: { title: this0.title, __resolveType: \\"Movie\\" } }) AS var4
            }
            RETURN { edges: var4, totalCount: totalCount } AS this"
        `);

        expect(result.params).toMatchInlineSnapshot(`
            Object {
              "isAuthenticated": true,
              "param0": Array [
                0.57728399,
                0.8260711,
                -0.18943521,
                -0.86630089,
                0.50722141,
                0.9413647,
                -0.00287237,
                0.5678057,
                -0.34498478,
                0.62378039,
                -0.17022743,
                0.84307471,
                0.83325899,
                -0.36753407,
                0.7642778,
                0.82613028,
                -0.16147488,
                -0.88113195,
                -0.25712598,
                0.17258664,
                0.63981952,
                0.52201768,
                -0.28939083,
                -0.85470267,
                0.62796275,
                0.19119759,
                -0.10786322,
                -0.71178741,
                0.16297122,
                -0.5236891,
                0.02301018,
                0.19934932,
                -0.20613451,
                -0.09630034,
                0.71799613,
                0.00802349,
                0.16620695,
                0.99894364,
                0.84095019,
                0.49911925,
                0.1868809,
                0.59355553,
                0.52967388,
                0.10423087,
                0.06609644,
                0.82136386,
                0.47898197,
                0.13019541,
                0.67751487,
                0.30949429,
                -0.54260053,
                0.88476482,
                -0.48187063,
                0.91694089,
                0.08032545,
                0.24976293,
                -0.0066078,
                -0.62484044,
                0.07914211,
                -0.80002603,
                -0.50121599,
                -0.97093072,
                0.95978468,
                0.18477219,
                -0.32575437,
                0.97763851,
                0.06296013,
                -0.23328443,
                0.79023972,
                -0.32595528,
                0.5578954,
                -0.94650406,
                -0.18724417,
                -0.04608709,
                -0.78561546,
                -0.25202331,
                -0.37463436,
                -0.33241845,
                0.11763381,
                -0.10055221,
                0.65539967,
                -0.84661474,
                0.88373379,
                -0.57329167,
                0.34545063,
                -0.72035787,
                -0.17781696,
                -0.18101958,
                0.1364994,
                -0.15453807,
                -0.41842143,
                -0.59314459,
                0.4448963,
                -0.41053446,
                -0.43375532,
                0.63044441,
                0.20762297,
                -0.35957381,
                -0.9894614,
                0.10915881,
                -0.07803859,
                0.29098689,
                0.47958243,
                0.25725614,
                -0.22877552,
                -0.45436423,
                0.63265844,
                -0.09687853,
                0.42960041,
                -0.52444649,
                -0.48323709,
                -0.99241219,
                0.94608191,
                -0.29829612,
                -0.59107999,
                -0.49592416,
                0.42438153,
                0.4650137,
                -0.2751502,
                0.0472371,
                0.18107815,
                0.91924594,
                -0.0928359,
                0.06657278,
                -0.83372123,
                0.87701374,
                -0.9729012,
                0.67098634,
              ],
              "param1": "Movie",
              "param3": 2020,
            }
        `);
    });

    test("simple match with auth allow on connection edge ALL", async () => {
        const typeDefs = /* GraphQL */ `
            type Movie
                @node
                @vector(indexes: [{ indexName: "movie_index", embeddingProperty: "movieVector", queryName: "${queryName}" }])
                @authorization(
                    validate: [
                        { when: [BEFORE], where: { node: { directorConnection_ALL: { edge: { year_EQ: 2020 } } } } }
                    ]
                ) {
                title: String
                director: [Person!]! @relationship(type: "DIRECTED", direction: IN, properties: "Directed")
            }

            type Person @node {
                id: ID
            }

            type Directed @relationshipProperties {
                year: Int
            }
        `;

        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: { authorization: { key: secret } },
        });

        const query = /* GraphQL */ `
            query MovieVectorQuery($vector: [Float!]!) {
                ${queryName}(vector: $vector) {
                    edges {
                        node {
                            title
                        }
                    }
                }
            }
        `;

        const result = await translateQuery(neoSchema, query, {
            token,
            variableValues: {
                vector: testVector,
            },
            neo4jVersion: "5",
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "CALL db.index.vector.queryNodes(\\"movie_index\\", 4, $param0) YIELD node AS this0, score AS var1
            WHERE ($param1 IN labels(this0) AND apoc.util.validatePredicate(NOT ($isAuthenticated = true AND (EXISTS {
                MATCH (this0)<-[this2:DIRECTED]-(this3:Person)
                WHERE ($param3 IS NOT NULL AND this2.year = $param3)
            } AND NOT (EXISTS {
                MATCH (this0)<-[this2:DIRECTED]-(this3:Person)
                WHERE NOT ($param3 IS NOT NULL AND this2.year = $param3)
            }))), \\"@neo4j/graphql/FORBIDDEN\\", [0]))
            WITH collect({ node: this0 }) AS edges
            WITH edges, size(edges) AS totalCount
            CALL {
                WITH edges
                UNWIND edges AS edge
                WITH edge.node AS this0
                RETURN collect({ node: { title: this0.title, __resolveType: \\"Movie\\" } }) AS var4
            }
            RETURN { edges: var4, totalCount: totalCount } AS this"
        `);

        expect(result.params).toMatchInlineSnapshot(`
            Object {
              "isAuthenticated": true,
              "param0": Array [
                0.57728399,
                0.8260711,
                -0.18943521,
                -0.86630089,
                0.50722141,
                0.9413647,
                -0.00287237,
                0.5678057,
                -0.34498478,
                0.62378039,
                -0.17022743,
                0.84307471,
                0.83325899,
                -0.36753407,
                0.7642778,
                0.82613028,
                -0.16147488,
                -0.88113195,
                -0.25712598,
                0.17258664,
                0.63981952,
                0.52201768,
                -0.28939083,
                -0.85470267,
                0.62796275,
                0.19119759,
                -0.10786322,
                -0.71178741,
                0.16297122,
                -0.5236891,
                0.02301018,
                0.19934932,
                -0.20613451,
                -0.09630034,
                0.71799613,
                0.00802349,
                0.16620695,
                0.99894364,
                0.84095019,
                0.49911925,
                0.1868809,
                0.59355553,
                0.52967388,
                0.10423087,
                0.06609644,
                0.82136386,
                0.47898197,
                0.13019541,
                0.67751487,
                0.30949429,
                -0.54260053,
                0.88476482,
                -0.48187063,
                0.91694089,
                0.08032545,
                0.24976293,
                -0.0066078,
                -0.62484044,
                0.07914211,
                -0.80002603,
                -0.50121599,
                -0.97093072,
                0.95978468,
                0.18477219,
                -0.32575437,
                0.97763851,
                0.06296013,
                -0.23328443,
                0.79023972,
                -0.32595528,
                0.5578954,
                -0.94650406,
                -0.18724417,
                -0.04608709,
                -0.78561546,
                -0.25202331,
                -0.37463436,
                -0.33241845,
                0.11763381,
                -0.10055221,
                0.65539967,
                -0.84661474,
                0.88373379,
                -0.57329167,
                0.34545063,
                -0.72035787,
                -0.17781696,
                -0.18101958,
                0.1364994,
                -0.15453807,
                -0.41842143,
                -0.59314459,
                0.4448963,
                -0.41053446,
                -0.43375532,
                0.63044441,
                0.20762297,
                -0.35957381,
                -0.9894614,
                0.10915881,
                -0.07803859,
                0.29098689,
                0.47958243,
                0.25725614,
                -0.22877552,
                -0.45436423,
                0.63265844,
                -0.09687853,
                0.42960041,
                -0.52444649,
                -0.48323709,
                -0.99241219,
                0.94608191,
                -0.29829612,
                -0.59107999,
                -0.49592416,
                0.42438153,
                0.4650137,
                -0.2751502,
                0.0472371,
                0.18107815,
                0.91924594,
                -0.0928359,
                0.06657278,
                -0.83372123,
                0.87701374,
                -0.9729012,
                0.67098634,
              ],
              "param1": "Movie",
              "param3": 2020,
            }
        `);
    });
});
