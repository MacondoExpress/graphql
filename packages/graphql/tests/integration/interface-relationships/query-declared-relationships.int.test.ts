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

import { faker } from "@faker-js/faker";
import { graphql, type Source } from "graphql";
import { gql } from "graphql-tag";
import type { Driver, Session } from "neo4j-driver";
import { Neo4jGraphQL } from "../../../src/classes";
import { UniqueType } from "../../utils/graphql-types";
import Neo4j from "../neo4j";

describe("interface with declared relationships", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    let session: Session;
    let neoSchema: Neo4jGraphQL;

    let Movie: UniqueType;
    let Series: UniqueType;
    let Actor: UniqueType;
    let Episode: UniqueType;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    beforeEach(async () => {
        Movie = new UniqueType("Movie");
        Series = new UniqueType("Series");
        Actor = new UniqueType("Actor");
        Episode = new UniqueType("Episode");
        session = await neo4j.getSession();

        const typeDefs = gql`
            type ${Episode} {
                runtime: Int!
                series: ${Series}! @relationship(type: "HAS_EPISODE", direction: IN)
            }

            interface Production {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            type ${Movie} implements Production {
                title: String!
                runtime: Int!
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
            }

            type ${Series} implements Production {
                title: String!
                episodeCount: Int!
                episodes: [${Episode}!]! @relationship(type: "HAS_EPISODE", direction: OUT)
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "StarredIn")
            }

            type ActedIn @relationshipProperties {
                screenTime: Int!
            }


            type StarredIn @relationshipProperties {
                episodeNr: Int!
            }

            type ${Actor} {
                name: String!
                actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
    });

    afterEach(async () => {
        await session.run(
            `
                MATCH(a:${Movie})
                MATCH(b:${Series})
                MATCH(c:${Actor})

                DETACH DELETE a
                DETACH DELETE b
                DETACH DELETE c
            `
        );
        await session.close();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("should read and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });

        const query = `
            query Productions {
                productions {
                    title
                    actors {
                        name
                        actedIn {
                            title
                            ... on ${Movie} {
                                runtime
                            }
                            ... on ${Series} {
                                episodeCount
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { screenTime: $seriesScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["productions"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actors: expect.toIncludeSameMembers([
                    {
                        name: actorName,
                        actedIn: expect.toIncludeSameMembers([
                            {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            {
                                title: seriesTitle,
                                episodeCount: seriesEpisodes,
                            },
                        ]),
                    },
                ]),
            },
            {
                title: movieTitle2,
                actors: expect.toIncludeSameMembers([
                    {
                        name: actorName,
                        actedIn: expect.toIncludeSameMembers([
                            {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            {
                                title: seriesTitle,
                                episodeCount: seriesEpisodes,
                            },
                        ]),
                    },
                    {
                        name: actorName2,
                        actedIn: [
                            {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                        ],
                    },
                ]),
            },
            {
                title: seriesTitle,
                actors: expect.toIncludeSameMembers([
                    {
                        name: actorName,
                        actedIn: expect.toIncludeSameMembers([
                            {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            {
                                title: seriesTitle,
                                episodeCount: seriesEpisodes,
                            },
                        ]),
                    },
                ]),
            },
        ]);
    });

    test("should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Productions {
                productions {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["productions"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    // actorsConnection -> sort -> edge
    test("should read connection and return interface relationship fields sorted", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = 1;
        const movieScreenTime2 = 2;
        const movieScreenTime3 = 3;

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = 10;
        const episodeNr2 = 11;

        const query = /* GraphQL */ `
            query Productions {
                productions {
                    title
                    actorsConnection(
                        sort: [{ edge: { ActedIn: { screenTime: ASC }, StarredIn: { episodeNr: DESC } } }]
                    ) {
                        edges {
                            node {
                                name
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime2 }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (s:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime3 }]->(s)
                CREATE (a2)-[:ACTED_IN { episodeNr: $episodeNr2, screenTime: $movieScreenTime2 }]->(s)
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                movieScreenTime2,
                movieScreenTime3,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
                episodeNr2,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["productions"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName2,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName,
                            },
                            properties: {
                                screenTime: movieScreenTime2,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName2,
                            },
                            properties: {
                                episodeNr: episodeNr2,
                            },
                        },
                        {
                            node: {
                                name: actorName,
                            },
                            properties: {
                                episodeNr: episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("should read connection and return interface relationship fields sorted - only one edge specified in sort", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = 1;
        const movieScreenTime2 = 2;
        const movieScreenTime3 = 3;

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = 10;
        const episodeNr2 = 11;

        const query = /* GraphQL */ `
            query Productions {
                productions {
                    title
                    actorsConnection(sort: [{ edge: { StarredIn: { episodeNr: DESC } } }]) {
                        edges {
                            node {
                                name
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime2 }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (s:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime3 }]->(s)
                CREATE (a2)-[:ACTED_IN { episodeNr: $episodeNr2, screenTime: $movieScreenTime2 }]->(s)
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                movieScreenTime2,
                movieScreenTime3,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
                episodeNr2,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["productions"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName2,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName,
                            },
                            properties: {
                                screenTime: movieScreenTime2,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName2,
                            },
                            properties: {
                                episodeNr: episodeNr2,
                            },
                        },
                        {
                            node: {
                                name: actorName,
                            },
                            properties: {
                                episodeNr: episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    // update -> update -> edge
    test("update interface relationship, update edge", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            mutation {
                ${Actor.operations.update}(update: { actedIn: [{ update: { node: { actors: [{ update: { edge: { ActedIn: { screenTime: 0 } } } }] } } }] }) {
                    ${Actor.plural} {
                        name
                        actedInConnection {
                            edges {
                                node {
                                    title
                                    actorsConnection {
                                        edges {
                                            node {
                                                name
                                                actedInConnection {
                                                    edges {
                                                        node {
                                                            title
                                                            ... on ${Movie} {
                                                                runtime
                                                            }
                                                            ... on ${Series} {
                                                                episodeCount
                                                            }
                                                        }
                                                        properties {
                                                            screenTime
                                                        }
                                                    }
                                                }
                                            }
                                            properties {
                                                ... on ActedIn {
                                                    screenTime
                                                }
                                                ... on StarredIn {
                                                    episodeNr
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect((gqlResult.data?.[Actor.operations.update] as Record<string, any>)?.[Actor.plural]).toIncludeSameMembers(
            [
                {
                    name: actorName,
                    actedInConnection: {
                        edges: expect.toIncludeSameMembers([
                            {
                                node: {
                                    title: movieTitle2,
                                    actorsConnection: {
                                        edges: expect.toIncludeSameMembers([
                                            {
                                                node: {
                                                    name: actorName2,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                        ]),
                                    },
                                },
                            },
                            {
                                node: {
                                    title: movieTitle,
                                    actorsConnection: {
                                        edges: [
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                        ],
                                    },
                                },
                            },
                            {
                                node: {
                                    title: seriesTitle,
                                    actorsConnection: {
                                        edges: [
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { episodeNr },
                                            },
                                        ],
                                    },
                                },
                            },
                        ]),
                    },
                },
                {
                    name: actorName2,
                    actedInConnection: {
                        edges: [
                            {
                                node: {
                                    title: movieTitle2,
                                    actorsConnection: {
                                        edges: expect.toIncludeSameMembers([
                                            {
                                                node: {
                                                    name: actorName2,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                        ]),
                                    },
                                },
                            },
                        ],
                    },
                },
            ]
        );
    });

    // update -> create -> edge
    test("update interface relationship, create edge", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            mutation {
                ${Actor.operations.update}(update: { 
                    actedIn: [{ 
                        where: { OR: [{ node: { title: "${movieTitle}" } }] }, 
                        update: { 
                            node: { 
                                actors: [{ 
                                    #where: { OR: [{ node: { name: "${actorName}" } }, { edge: { StarredIn: { episodeNr: ${episodeNr} } } }] }, 
                                    create: { node: { name: "custom actor" }, edge: { ActedIn: { screenTime: 101 }, StarredIn: { episodeNr: 101 } } } 
                                }] 
                            } 
                        } 
                    }] 
                }) {
                    ${Actor.plural} {
                        name
                        actedInConnection {
                            edges {
                                node {
                                    title
                                    actorsConnection {
                                        edges {
                                            node {
                                                name
                                                actedInConnection {
                                                    edges {
                                                        node {
                                                            title
                                                            ... on ${Movie} {
                                                                runtime
                                                            }
                                                            ... on ${Series} {
                                                                episodeCount
                                                            }
                                                        }
                                                        properties {
                                                            screenTime
                                                        }
                                                    }
                                                }
                                            }
                                            properties {
                                                ... on ActedIn {
                                                    screenTime
                                                }
                                                ... on StarredIn {
                                                    episodeNr
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect((gqlResult.data?.[Actor.operations.update] as Record<string, any>)?.[Actor.plural]).toIncludeSameMembers(
            [
                {
                    name: actorName,
                    actedInConnection: {
                        edges: expect.toIncludeSameMembers([
                            {
                                node: {
                                    title: movieTitle2,
                                    actorsConnection: {
                                        edges: expect.toIncludeSameMembers([
                                            {
                                                node: {
                                                    name: actorName2,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                        ]),
                                    },
                                },
                            },
                            {
                                node: {
                                    title: movieTitle,
                                    actorsConnection: {
                                        edges: [
                                            {
                                                node: {
                                                    name: "custom actor",
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: {
                                                                    title: movieTitle,
                                                                    runtime: movieRuntime,
                                                                },
                                                                properties: {
                                                                    screenTime: 101,
                                                                },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: 101 },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                        ],
                                    },
                                },
                            },
                            {
                                node: {
                                    title: seriesTitle,
                                    actorsConnection: {
                                        edges: [
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { episodeNr },
                                            },
                                        ],
                                    },
                                },
                            },
                        ]),
                    },
                },
                {
                    name: actorName2,
                    actedInConnection: {
                        edges: [
                            {
                                node: {
                                    title: movieTitle2,
                                    actorsConnection: {
                                        edges: expect.toIncludeSameMembers([
                                            {
                                                node: {
                                                    name: actorName2,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                        ]),
                                    },
                                },
                            },
                        ],
                    },
                },
            ]
        );
    });

    // update -> connect -> edge
    test("update interface relationship, connect edge", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";
        const actorName3 = "another actor";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            mutation {
                ${Actor.operations.update}(update: { 
                    actedIn: [{ # ActorActedInUpdateFieldInput
                        where: { node: { title: "${movieTitle}" } } # ActorActedInConnectionWhere
                        update: { # ActorActedInUpdateConnectionInput
                            node: { # ProductionUpdateInput
                                actors: [{  # ProductionActorsUpdateFieldInput                          
                                    connect: {  # ProductionActorsConnectFieldInput
                                        where: { node: { name: "${actorName3}" } }, 
                                        edge: { ActedIn: { screenTime: 111 }, StarredIn: { episodeNr: 111 } }, 
                                    } 
                                }] 
                            } 
                        } 
                    }] 
                }) {
                    ${Actor.plural} {
                        name
                        actedInConnection {
                            edges {
                                node {
                                    title
                                    actorsConnection {
                                        edges {
                                            node {
                                                name
                                                actedInConnection {
                                                    edges {
                                                        node {
                                                            title
                                                            ... on ${Movie} {
                                                                runtime
                                                            }
                                                            ... on ${Series} {
                                                                episodeCount
                                                            }
                                                        }
                                                        properties {
                                                            screenTime
                                                        }
                                                    }
                                                }
                                            }
                                            properties {
                                                ... on ActedIn {
                                                    screenTime
                                                }
                                                ... on StarredIn {
                                                    episodeNr
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (:${Actor} { name: $actorName3 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                actorName3,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect((gqlResult.data?.[Actor.operations.update] as Record<string, any>)?.[Actor.plural]).toIncludeSameMembers(
            [
                {
                    name: actorName,
                    actedInConnection: {
                        edges: expect.toIncludeSameMembers([
                            {
                                node: {
                                    title: movieTitle2,
                                    actorsConnection: {
                                        edges: expect.toIncludeSameMembers([
                                            {
                                                node: {
                                                    name: actorName2,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                        ]),
                                    },
                                },
                            },
                            {
                                node: {
                                    title: movieTitle,
                                    actorsConnection: {
                                        edges: [
                                            {
                                                node: {
                                                    name: actorName3,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 111 },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: 111 },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                        ],
                                    },
                                },
                            },
                            {
                                node: {
                                    title: seriesTitle,
                                    actorsConnection: {
                                        edges: [
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { episodeNr },
                                            },
                                        ],
                                    },
                                },
                            },
                        ]),
                    },
                },
                {
                    name: actorName2,
                    actedInConnection: {
                        edges: [
                            {
                                node: {
                                    title: movieTitle2,
                                    actorsConnection: {
                                        edges: expect.toIncludeSameMembers([
                                            {
                                                node: {
                                                    name: actorName2,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                        ]),
                                    },
                                },
                            },
                        ],
                    },
                },
                {
                    name: actorName3,
                    actedInConnection: {
                        edges: expect.toIncludeSameMembers([
                            {
                                node: {
                                    title: movieTitle,
                                    actorsConnection: {
                                        edges: [
                                            {
                                                node: {
                                                    name: actorName3,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 111 },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: 111 },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: movieScreenTime },
                                            },
                                        ],
                                    },
                                },
                            },
                        ]),
                    },
                },
            ]
        );
    });

    test("create interface relationship, connect edge", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieRuntime = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            mutation {
                ${Actor.operations.create}(input: [{ 
                    name: "${actorName2}"
                    actedIn: { 
                        connect: [{ 
                            edge: { screenTime: 112 }
                            where: { node: { title: "${movieTitle}" } } 
                            connect: { 
                                actors: [{  
                                    edge: { ActedIn: { screenTime: 111 }, StarredIn: { episodeNr: 111 } }, 
                                    
                                }] 
                            } 
                        }] 
                    }
                }]) {
                    ${Actor.plural} {
                        name
                        actedInConnection {
                            edges {
                                node {
                                    title
                                    actorsConnection {
                                        edges {
                                            node {
                                                name
                                                actedInConnection {
                                                    edges {
                                                        node {
                                                            title
                                                            ... on ${Movie} {
                                                                runtime
                                                            }
                                                            ... on ${Series} {
                                                                episodeCount
                                                            }
                                                        }
                                                        properties {
                                                            screenTime
                                                        }
                                                    }
                                                }
                                            }
                                            properties {
                                                ... on ActedIn {
                                                    screenTime
                                                }
                                                ... on StarredIn {
                                                    episodeNr
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
           `,
            {
                actorName,
                movieTitle,
                movieRuntime,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect((gqlResult.data?.[Actor.operations.create] as Record<string, any>)?.[Actor.plural]).toIncludeSameMembers(
            [
                {
                    name: actorName2,
                    actedInConnection: {
                        edges: [
                            {
                                node: {
                                    title: movieTitle,
                                    actorsConnection: {
                                        edges: expect.toIncludeSameMembers([
                                            {
                                                node: {
                                                    name: actorName2,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 111 },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: 111 },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 111 },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: 111 },
                                            },
                                        ]),
                                    },
                                },
                            },
                        ],
                    },
                },
            ]
        );
    });
});

describe("interface implementing interface with declared relationships", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    let session: Session;
    let neoSchema: Neo4jGraphQL;

    let Movie: UniqueType;
    let Series: UniqueType;
    let Actor: UniqueType;
    let Episode: UniqueType;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    beforeEach(async () => {
        Movie = new UniqueType("Movie");
        Series = new UniqueType("Series");
        Actor = new UniqueType("Actor");
        Episode = new UniqueType("Episode");
        session = await neo4j.getSession();

        const typeDefs = gql`
            type ${Episode} {
                runtime: Int!
                series: ${Series}! @relationship(type: "HAS_EPISODE", direction: IN)
            }

            interface Show {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            interface Production implements Show {
                title: String!
                actors: [${Actor}!]! 
            }

            type ${Movie} implements Production & Show {
                title: String!
                runtime: Int!
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
            }

            type ${Series} implements Production & Show {
                title: String!
                episodeCount: Int!
                episodes: [${Episode}!]! @relationship(type: "HAS_EPISODE", direction: OUT)
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "StarredIn")
            }

            type ActedIn @relationshipProperties {
                screenTime: Int!
            }


            type StarredIn @relationshipProperties {
                episodeNr: Int!
            }

            type ${Actor} {
                name: String!
                actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
    });

    afterEach(async () => {
        await session.run(
            `
                MATCH(a:${Movie})
                MATCH(b:${Series})
                MATCH(c:${Actor})

                DETACH DELETE a
                DETACH DELETE b
                DETACH DELETE c
            `
        );
        await session.close();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("intermediate interface relationship field can still be traversed with simple query even though it's missing the @declareRelationship", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });

        const query = `
            query Productions {
                productions {
                    title
                    actors {
                        name
                        actedIn {
                            title
                            ... on ${Movie} {
                                runtime
                            }
                            ... on ${Series} {
                                episodeCount
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { screenTime: $seriesScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["productions"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actors: expect.toIncludeSameMembers([
                    {
                        name: actorName,
                        actedIn: expect.toIncludeSameMembers([
                            {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            {
                                title: seriesTitle,
                                episodeCount: seriesEpisodes,
                            },
                        ]),
                    },
                ]),
            },
            {
                title: movieTitle2,
                actors: expect.toIncludeSameMembers([
                    {
                        name: actorName,
                        actedIn: expect.toIncludeSameMembers([
                            {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            {
                                title: seriesTitle,
                                episodeCount: seriesEpisodes,
                            },
                        ]),
                    },
                    {
                        name: actorName2,
                        actedIn: [
                            {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                        ],
                    },
                ]),
            },
            {
                title: seriesTitle,
                actors: expect.toIncludeSameMembers([
                    {
                        name: actorName,
                        actedIn: expect.toIncludeSameMembers([
                            {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            {
                                title: seriesTitle,
                                episodeCount: seriesEpisodes,
                            },
                        ]),
                    },
                ]),
            },
        ]);
    });

    test("intermediate interface relationship field can NOT be traversed with the connection query because it's missing the  @declareRelationship", async () => {
        const query = /* GraphQL */ `
            query Productions {
                productions {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors?.[0]?.message).toInclude(`Cannot query field "actorsConnection" on type "Production"`);
    });

    test("SHOW should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Shows {
                shows {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["shows"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("SHOW MOVIE CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Shows {
                shows {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                                actorsConnection {
                                                    edges {
                                                        node {
                                                            name
                                                        }
                                                    }
                                                }
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["shows"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("SHOW CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Shows {
                shows {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            actorsConnection {
                                                edges {
                                                    node {
                                                        name
                                                    }
                                                }
                                            }
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors?.[0]?.message).toInclude(`Cannot query field "actorsConnection" on type "Production"`);
    });

    /* eslint-disable-next-line jest/no-disabled-tests */
    test.skip("WHERE?", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });

        // const query = `
        //     query Actors {
        //         ${Actor.plural}(where: { actedIn: { title: "${movieTitle}" } }) {
        //             name
        //             actedIn {
        //                 title
        //             }
        //         }
        //     }
        // `;
        const queryC = `
            query Actors {
                ${Actor.plural}(where: { actedInConnection: { node: { title: "${movieTitle}" } } }) {
                    name
                    actedIn {
                        title
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { screenTime: $seriesScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: queryC,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.[Actor.plural]).toIncludeSameMembers([
            {
                name: actorName,
                actedIn: expect.toIncludeSameMembers([
                    {
                        title: movieTitle,
                    },
                ]),
            },
        ]);
    });
});

describe("interface implementing interface with declared relationships - two level interface chain", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    let session: Session;
    let neoSchema: Neo4jGraphQL;

    let Movie: UniqueType;
    let Series: UniqueType;
    let Actor: UniqueType;
    let Episode: UniqueType;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    beforeEach(async () => {
        Movie = new UniqueType("Movie");
        Series = new UniqueType("Series");
        Actor = new UniqueType("Actor");
        Episode = new UniqueType("Episode");
        session = await neo4j.getSession();

        const typeDefs = gql`
            type ${Episode} {
                runtime: Int!
                series: ${Series}! @relationship(type: "HAS_EPISODE", direction: IN)
            }

            interface Thing {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            interface Show implements Thing {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            interface Production implements Thing & Show {
                title: String!
                actors: [${Actor}!]! 
            }

            type ${Movie} implements Production & Show & Thing {
                title: String!
                runtime: Int!
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
            }

            type ${Series} implements Production & Show & Thing {
                title: String!
                episodeCount: Int!
                episodes: [${Episode}!]! @relationship(type: "HAS_EPISODE", direction: OUT)
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "StarredIn")
            }

            type ActedIn @relationshipProperties {
                screenTime: Int!
            }


            type StarredIn @relationshipProperties {
                episodeNr: Int!
            }

            type ${Actor} {
                name: String!
                actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
    });

    afterEach(async () => {
        await session.run(
            `
                MATCH(a:${Movie})
                MATCH(b:${Series})
                MATCH(c:${Actor})

                DETACH DELETE a
                DETACH DELETE b
                DETACH DELETE c
            `
        );
        await session.close();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("THING should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Things {
                things {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["things"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("THING MOVIE CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Things {
                things {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                                actorsConnection {
                                                    edges {
                                                        node {
                                                            name
                                                        }
                                                    }
                                                }
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["things"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("SHOW should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Shows {
                shows {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["shows"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("SHOW MOVIE CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Shows {
                shows {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                                actorsConnection {
                                                    edges {
                                                        node {
                                                            name
                                                        }
                                                    }
                                                }
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["shows"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });
});

describe("interface implementing interface with declared relationships - three level interface chain", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    let session: Session;
    let neoSchema: Neo4jGraphQL;

    let Movie: UniqueType;
    let Series: UniqueType;
    let Actor: UniqueType;
    let Episode: UniqueType;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    beforeEach(async () => {
        Movie = new UniqueType("Movie");
        Series = new UniqueType("Series");
        Actor = new UniqueType("Actor");
        Episode = new UniqueType("Episode");
        session = await neo4j.getSession();

        const typeDefs = gql`
            type ${Episode} {
                runtime: Int!
                series: ${Series}! @relationship(type: "HAS_EPISODE", direction: IN)
            }

            interface Thing {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            interface WatchableThing implements Thing {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            interface Show implements Thing & WatchableThing {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            interface Production implements WatchableThing & Thing & Show {
                title: String!
                actors: [${Actor}!]! 
            }

            type ${Movie} implements WatchableThing & Production & Show & Thing {
                title: String!
                runtime: Int!
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
            }

            type ${Series} implements WatchableThing & Production & Show & Thing {
                title: String!
                episodeCount: Int!
                episodes: [${Episode}!]! @relationship(type: "HAS_EPISODE", direction: OUT)
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "StarredIn")
            }

            type ActedIn @relationshipProperties {
                screenTime: Int!
            }


            type StarredIn @relationshipProperties {
                episodeNr: Int!
            }

            type ${Actor} {
                name: String!
                actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
    });

    afterEach(async () => {
        await session.run(
            `
                MATCH(a:${Movie})
                MATCH(b:${Series})
                MATCH(c:${Actor})

                DETACH DELETE a
                DETACH DELETE b
                DETACH DELETE c
            `
        );
        await session.close();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("WATCHABLE THING should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query WatchableThings {
                watchableThings {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["watchableThings"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("WATCHABLE THING MOVIE CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query WatchableThings {
                watchableThings {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                                actorsConnection {
                                                    edges {
                                                        node {
                                                            name
                                                        }
                                                    }
                                                }
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["watchableThings"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("THING should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Things {
                things {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["things"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("THING MOVIE CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Things {
                things {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                                actorsConnection {
                                                    edges {
                                                        node {
                                                            name
                                                        }
                                                    }
                                                }
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["things"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("SHOW should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Shows {
                shows {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["shows"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("SHOW MOVIE CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Shows {
                shows {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                                actorsConnection {
                                                    edges {
                                                        node {
                                                            name
                                                        }
                                                    }
                                                }
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["shows"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });
});

// TODO: add validation rule
/* eslint-disable-next-line jest/no-disabled-tests */
describe.skip("interface implementing interface with declared relationships on three interfaces that do not implement eachother", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    let session: Session;
    let neoSchema: Neo4jGraphQL;

    let Movie: UniqueType;
    let Series: UniqueType;
    let Actor: UniqueType;
    let Episode: UniqueType;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    beforeEach(async () => {
        Movie = new UniqueType("Movie");
        Series = new UniqueType("Series");
        Actor = new UniqueType("Actor");
        Episode = new UniqueType("Episode");
        session = await neo4j.getSession();

        // TODO: add validation rule such that this is not possible
        // interface Production implements Thing & Show & WatchableThing
        // breaks everything,
        // eg. actorConnection result would be ThingActorsConnection or WatchableThingActorsConnection? technically needs to be both bc interface implements both Thing and WatchableThing
        const typeDefs = gql`
            type ${Episode} {
                runtime: Int!
                series: ${Series}! @relationship(type: "HAS_EPISODE", direction: IN)
            }

            interface Thing {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            interface WatchableThing {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            interface Show implements Thing {
                title: String!
                actors: [${Actor}!]! @declareRelationship
            }

            interface Production implements Thing & Show & WatchableThing {
                title: String!
                actors: [${Actor}!]! 
            }

            type ${Movie} implements WatchableThing & Production & Show & Thing {
                title: String!
                runtime: Int!
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
            }

            type ${Series} implements WatchableThing & Production & Show & Thing {
                title: String!
                episodeCount: Int!
                episodes: [${Episode}!]! @relationship(type: "HAS_EPISODE", direction: OUT)
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "StarredIn")
            }

            type ActedIn @relationshipProperties {
                screenTime: Int!
            }


            type StarredIn @relationshipProperties {
                episodeNr: Int!
            }

            type ${Actor} {
                name: String!
                actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
    });

    afterEach(async () => {
        await session.run(
            `
                MATCH(a:${Movie})
                MATCH(b:${Series})
                MATCH(c:${Actor})

                DETACH DELETE a
                DETACH DELETE b
                DETACH DELETE c
            `
        );
        await session.close();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("WATCHABLE THING should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query WatchableThings {
                watchableThings {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["watchableThings"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("WATCHABLE THING MOVIE CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query WatchableThings {
                watchableThings {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                                actorsConnection {
                                                    edges {
                                                        node {
                                                            name
                                                        }
                                                    }
                                                }
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["watchableThings"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("THING should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Things {
                things {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["things"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("THING MOVIE CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Things {
                things {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                                actorsConnection {
                                                    edges {
                                                        node {
                                                            name
                                                        }
                                                    }
                                                }
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["things"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("SHOW should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Shows {
                shows {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["shows"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: { title: movieTitle2, runtime: movieRuntime },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("SHOW MOVIE CONNECTION should read connection and return interface relationship fields", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const episodeNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Shows {
                shows {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                actedInConnection {
                                    edges {
                                        node {
                                            title
                                            ... on ${Movie} {
                                                runtime
                                                actorsConnection {
                                                    edges {
                                                        node {
                                                            name
                                                        }
                                                    }
                                                }
                                            }
                                            ... on ${Series} {
                                                episodeCount
                                            }
                                        }
                                        properties {
                                            screenTime
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                                ... on StarredIn {
                                    episodeNr
                                }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName })
                CREATE (a2:${Actor} { name: $actorName2 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr, screenTime: $movieScreenTime }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                episodeNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["shows"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                name: actorName2,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: seriesTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                                actorsConnection: {
                                                    edges: expect.toIncludeSameMembers([
                                                        {
                                                            node: {
                                                                name: actorName,
                                                            },
                                                        },
                                                        {
                                                            node: {
                                                                name: actorName2,
                                                            },
                                                        },
                                                    ]),
                                                },
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: seriesTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                episodeNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });
});

describe("type narrowing - simple case", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    let session: Session;
    let neoSchema: Neo4jGraphQL;

    let Movie: UniqueType;
    let AmatureProduction: UniqueType;
    let Actor: UniqueType;
    let UntrainedPerson: UniqueType;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    beforeEach(async () => {
        Movie = new UniqueType("Movie");
        AmatureProduction = new UniqueType("AmatureProduction");
        Actor = new UniqueType("Actor");
        UntrainedPerson = new UniqueType("UntrainedPerson");
        session = await neo4j.getSession();

        const typeDefs = gql`
            interface Production {
                title: String!
                actors: [Person!]! @declareRelationship
            }

            type ${Movie} implements Production {
                title: String!
                runtime: Int!
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
            }

            type ${AmatureProduction} implements Production {
                title: String!
                episodeCount: Int!
                actors: [${UntrainedPerson}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "AppearsIn")
            }

            type ActedIn @relationshipProperties {
                screenTime: Int!
            }

            type AppearsIn @relationshipProperties {
                sceneNr: Int!
            }

            interface Person {
                name: String!
                actedIn: [Production!]! @declareRelationship
            }

            type ${Actor} implements Person {
                name: String!
                moviesCnt: Int!
                actedIn: [${Movie}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
            }

            type ${UntrainedPerson} implements Person {
                name: String!
                age: Int!
                actedIn: [${AmatureProduction}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "AppearsIn")
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
    });

    afterEach(async () => {
        await session.run(
            `
                MATCH(a:${Movie})
                MATCH(b:${AmatureProduction})
                MATCH(c:${Actor})
                MATCH(d:${UntrainedPerson})

                DETACH DELETE a
                DETACH DELETE b
                DETACH DELETE c
                DETACH DELETE d
            `
        );
        await session.close();
    });

    afterAll(async () => {
        await driver.close();
    });

    test("get narrowed connection field", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Productions {
                productions {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                ... on ${Actor} {
                                    moviesCnt
                                }
                                ... on ${UntrainedPerson} {
                                    age
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                               ... on AppearsIn {
                                    sceneNr
                               }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["productions"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                moviesCnt: 1,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                moviesCnt: 1,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: amatureProductionTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: untrainedPersonName,
                                age: 20,
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("get narrowed connection field nested for one narrowed type", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Productions {
                productions {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                ... on ${Actor} {
                                    moviesCnt
                                    actedInConnection {
                                        edges {
                                            node {
                                                title
                                                ... on ${Movie} {
                                                    runtime
                                                }
                                            }
                                            properties {
                                                ... on ActedIn {
                                                    screenTime
                                                }
                                            }
                                        }
                                    }
                                }
                                ... on ${UntrainedPerson} {
                                    age
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                               ... on AppearsIn {
                                    sceneNr
                               }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["productions"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                moviesCnt: 1,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                moviesCnt: 1,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: movieTitle,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                        {
                                            node: {
                                                title: movieTitle2,
                                                runtime: movieRuntime,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: amatureProductionTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: untrainedPersonName,
                                age: 20,
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("get narrowed connection field nested for the other narrowed type", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Productions {
                productions {
                    title
                    actorsConnection {
                        edges {
                            node {
                                name
                                ... on ${Actor} {
                                    moviesCnt
                                }
                                ... on ${UntrainedPerson} {
                                    age
                                    actedInConnection {
                                        edges {
                                            node {
                                                title
                                                ... on ${Movie} {
                                                    runtime
                                                }
                                                ... on ${AmatureProduction} {
                                                    episodeCount
                                                }
                                            }
                                            properties {
                                                ... on ActedIn {
                                                    screenTime
                                                }
                                                ... on AppearsIn {
                                                    sceneNr
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                               ... on AppearsIn {
                                    sceneNr
                               }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["productions"]).toIncludeSameMembers([
            {
                title: movieTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                moviesCnt: 1,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: movieTitle2,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: actorName,
                                moviesCnt: 1,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                title: amatureProductionTitle,
                actorsConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                name: untrainedPersonName,
                                age: 20,
                                actedInConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                title: amatureProductionTitle,
                                                episodeCount: seriesEpisodes,
                                            },
                                            properties: {
                                                sceneNr,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    // TODO: translation layer does not seem to support connection filters on interfaces
    /* eslint-disable-next-line jest/no-disabled-tests */
    test.skip("get narrowed connection field + filter on edge top level", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query People {
                people(where: { actedInConnection: { edge: { ActedIn: { screenTime: ${movieScreenTime} }, AppearsIn: { sceneNr: ${sceneNr} } } } }) {
                    name
                    actedInConnection {
                        edges {
                            node {
                                title
                                ... on ${Movie} {
                                    runtime
                                }
                                ... on ${AmatureProduction} {
                                    episodeCount
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                               ... on AppearsIn {
                                    sceneNr
                               }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["people"]).toIncludeSameMembers([
            {
                name: actorName,
                moviesCnt: 1,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                name: untrainedPersonName,
                age: 20,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: amatureProductionTitle,
                                episodeCount: seriesEpisodes,
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                        {
                            node: {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
        ]);
    });
    // TODO: translation layer does not seem to support connection filters on interfaces
    /* eslint-disable-next-line jest/no-disabled-tests */
    test.skip("get narrowed connection field + filter on node top level", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query People {
                people(where: { actedInConnection: { node: { title: "${movieTitle}" } } }) {
                    name
                    actedInConnection {
                        edges {
                            node {
                                title
                                ... on ${Movie} {
                                    runtime
                                }
                                ... on ${AmatureProduction} {
                                    episodeCount
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                               ... on AppearsIn {
                                    sceneNr
                               }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["people"]).toIncludeSameMembers([
            {
                name: actorName,
                moviesCnt: 1,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
            {
                name: untrainedPersonName,
                age: 20,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: amatureProductionTitle,
                                episodeCount: seriesEpisodes,
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                        {
                            node: {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("get narrowed connection field + filter on edge nested - only one possible propertiesTypeName", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });
        const movieScreenTime2 = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query People {
                people {
                    name
                    actedInConnection {
                        edges {
                            node {
                                title
                                actorsConnection(where: { edge: { ActedIn: {screenTime: ${movieScreenTime2}}, AppearsIn: {} } }) {
                                    edges {
                                        node {
                                            name
                                            ... on ${Actor} {
                                                moviesCnt
                                            }
                                            ... on ${UntrainedPerson} {
                                                age
                                            }
                                        }
                                        properties {
                                            ... on ActedIn {
                                                screenTime
                                            }
                                           ... on AppearsIn {
                                                sceneNr
                                           }
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                               ... on AppearsIn {
                                    sceneNr
                               }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime2 }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                movieScreenTime2,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["people"]).toIncludeSameMembers([
            {
                name: actorName,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: movieTitle,
                                actorsConnection: {
                                    edges: [],
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                title: movieTitle2,
                                actorsConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                name: actorName,
                                                moviesCnt: 1,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime2,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime2,
                            },
                        },
                    ]),
                },
            },
            {
                name: untrainedPersonName,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: amatureProductionTitle,
                                actorsConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                name: untrainedPersonName,
                                                age: 20,
                                            },
                                            properties: {
                                                sceneNr,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("get narrowed connection field + filter on edge nested - other possible propertiesTypeName", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });
        const movieScreenTime2 = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query People {
                people {
                    name
                    actedInConnection {
                        edges {
                            node {
                                title
                                actorsConnection(where: { edge: {  AppearsIn: { sceneNr_NOT: ${sceneNr} } } }) {
                                    edges {
                                        node {
                                            name
                                            ... on ${Actor} {
                                                moviesCnt
                                            }
                                            ... on ${UntrainedPerson} {
                                                age
                                            }
                                        }
                                        properties {
                                            ... on ActedIn {
                                                screenTime
                                            }
                                           ... on AppearsIn {
                                                sceneNr
                                           }
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                               ... on AppearsIn {
                                    sceneNr
                               }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime2 }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                movieScreenTime2,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["people"]).toIncludeSameMembers([
            {
                name: actorName,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: movieTitle,
                                actorsConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                name: actorName,
                                                moviesCnt: 1,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                title: movieTitle2,
                                actorsConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                name: actorName,
                                                moviesCnt: 1,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime2,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime2,
                            },
                        },
                    ]),
                },
            },
            {
                name: untrainedPersonName,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: amatureProductionTitle,
                                actorsConnection: {
                                    edges: [],
                                },
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("get narrowed connection field + filter on edge nested - all possible propertiesTypeName", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });
        const movieScreenTime2 = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query People {
                people {
                    name
                    actedInConnection {
                        edges {
                            node {
                                title
                                actorsConnection(where: { edge: { ActedIn: { screenTime_NOT: ${movieScreenTime} }, AppearsIn: { sceneNr_NOT: ${sceneNr} } } }) {
                                    edges {
                                        node {
                                            name
                                            ... on ${Actor} {
                                                moviesCnt
                                            }
                                            ... on ${UntrainedPerson} {
                                                age
                                            }
                                        }
                                        properties {
                                            ... on ActedIn {
                                                screenTime
                                            }
                                           ... on AppearsIn {
                                                sceneNr
                                           }
                                        }
                                    }
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                               ... on AppearsIn {
                                    sceneNr
                               }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime2 }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                movieScreenTime2,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.["people"]).toIncludeSameMembers([
            {
                name: actorName,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: movieTitle,
                                actorsConnection: {
                                    edges: [],
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                title: movieTitle2,
                                actorsConnection: {
                                    edges: expect.toIncludeSameMembers([
                                        {
                                            node: {
                                                name: actorName,
                                                moviesCnt: 1,
                                            },
                                            properties: {
                                                screenTime: movieScreenTime2,
                                            },
                                        },
                                    ]),
                                },
                            },
                            properties: {
                                screenTime: movieScreenTime2,
                            },
                        },
                    ]),
                },
            },
            {
                name: untrainedPersonName,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: amatureProductionTitle,
                                actorsConnection: {
                                    edges: [],
                                },
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("concrete.interfaceConnection edge filter works for the correct propertiesTypeName", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });
        const movieScreenTime2 = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
            query Actors {
                ${Actor.plural} {
                    name
                    actedInConnection(where: { edge: { ActedIn: { screenTime: ${movieScreenTime} } } }) {
                        edges {
                            node {
                                title
                                ... on ${Movie} {
                                    runtime
                                }
                                ... on ${AmatureProduction} {
                                    episodeCount
                                }
                            }
                            properties {
                                ... on ActedIn {
                                    screenTime
                                }
                               ... on AppearsIn {
                                    sceneNr
                               }
                            }
                        }
                    }
                }
            }
        `;

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime2 }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                movieScreenTime2,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.[Actor.plural]).toIncludeSameMembers([
            {
                name: actorName,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                    ]),
                },
            },
        ]);
    });

    test("concrete.interfaceConnection edge filter ignores the incorrect propertiesTypeName (Person.actedIn can have AppearsIn properties but Actor.actedIn can only have ActedIn)", async () => {
        const actorName = "actor1";
        const untrainedPersonName = "anyone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });
        const movieScreenTime2 = faker.number.int({ max: 100000 });

        const amatureProductionTitle = "amature";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
        query Actors {
            ${Actor.plural} {
                name
                actedInConnection(where: { edge: { AppearsIn: { sceneNr: 0 } } }) {
                    edges {
                        node {
                            title
                            ... on ${Movie} {
                                runtime
                            }
                            ... on ${AmatureProduction} {
                                episodeCount
                            }
                        }
                        properties {
                            ... on ActedIn {
                                screenTime
                            }
                           ... on AppearsIn {
                                sceneNr
                           }
                        }
                    }
                }
            }
        }
    `;

        await session.run(
            `
            CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
            CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
            CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
            CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
            CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
            CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime2 }]->(m2)
            CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
            CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
        `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                movieScreenTime2,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        expect(gqlResult.data?.[Actor.plural]).toIncludeSameMembers([
            {
                name: actorName,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: movieTitle,
                                runtime: movieRuntime,
                            },
                            properties: {
                                screenTime: movieScreenTime,
                            },
                        },
                        {
                            node: {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            properties: {
                                screenTime: movieScreenTime2,
                            },
                        },
                    ]),
                },
            },
        ]);
    });
});

describe("type narrowing nested connections", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    let session: Session;
    let neoSchema: Neo4jGraphQL;
    let gqlQuery: string | Source;

    let Movie: UniqueType;
    let AmatureProduction: UniqueType;
    let Actor: UniqueType;
    let UntrainedPerson: UniqueType;

    let actorName: string;
    let untrainedPersonName: string;
    let movieTitle: string;
    let movieTitle2: string;
    let movieRuntime: number;
    let movieScreenTime: number;
    let amatureProductionTitle: string;
    let seriesEpisodes: number;
    let seriesScreenTime: number;
    let sceneNr: number;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();

        actorName = "actor1";
        untrainedPersonName = "anyone";
        movieTitle = "movie1";
        movieTitle2 = "movie2";
        movieRuntime = faker.number.int({ max: 100000 });
        movieScreenTime = faker.number.int({ max: 100000 });
        amatureProductionTitle = "amature";
        seriesEpisodes = faker.number.int({ max: 100000 });
        seriesScreenTime = faker.number.int({ max: 100000 });
        sceneNr = faker.number.int({ max: 100000 });

        Movie = new UniqueType("Movie");
        AmatureProduction = new UniqueType("AmatureProduction");
        Actor = new UniqueType("Actor");
        UntrainedPerson = new UniqueType("UntrainedPerson");
        session = await neo4j.getSession();

        await session.run(
            `
                CREATE (a:${Actor} { name: $actorName, moviesCnt: 1 })
                CREATE (up:${UntrainedPerson} { name: $untrainedPersonName, age: 20 })
                CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
                CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(m2)
                CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $seriesScreenTime }]->(:${AmatureProduction} { title: $amatureProductionTitle, episodeCount: $seriesEpisodes })
            `,
            {
                actorName,
                untrainedPersonName,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesEpisodes,
                seriesScreenTime,
                amatureProductionTitle,
                sceneNr,
            }
        );

        gqlQuery = /* GraphQL */ `
        query Productions {
            productions {
                title
                actorsConnection {
                    edges {
                        node {
                            name
                            actedInConnection {
                                edges {
                                    node {
                                        title
                                        ... on ${Movie} {
                                            runtime
                                        }
                                        ... on ${AmatureProduction} {
                                            episodeCount
                                        }
                                    }
                                    properties {
                                        ... on ActedIn {
                                            screenTime
                                        }
                                        ... on AppearsIn {
                                            sceneNr
                                        }
                                    }
                                }
                            }
                            ... on ${Actor} {
                                moviesCnt
                            }
                            ... on ${UntrainedPerson} {
                                age
                            }
                        }
                        properties {
                            ... on ActedIn {
                                screenTime
                            }
                           
                        }
                    }
                }
            }
        }
    `;
    });

    afterAll(async () => {
        await session.run(
            `
                MATCH(a:${Movie})
                MATCH(b:${AmatureProduction})
                MATCH(c:${Actor})
                MATCH(d:${UntrainedPerson})

                DETACH DELETE a
                DETACH DELETE b
                DETACH DELETE c
                DETACH DELETE d
            `
        );
        await driver.close();
    });

    test("connection field has relationship to one narrowed type only", async () => {
        const typeDefs = gql`
        interface Production {
            title: String!
            actors: [Person!]! @declareRelationship
        }

        type ${Movie} implements Production {
            title: String!
            runtime: Int!
            actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ${AmatureProduction} implements Production {
            title: String!
            episodeCount: Int!
            actors: [${UntrainedPerson}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ActedIn @relationshipProperties {
            screenTime: Int!
        }

        type AppearsIn @relationshipProperties {
            sceneNr: Int!
        }

        interface Person {
            name: String!
            actedIn: [Production!]! @declareRelationship
        }

        type ${Actor} implements Person {
            name: String!
            moviesCnt: Int!
            actedIn: [${Movie}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
        }

        type ${UntrainedPerson} implements Person {
            name: String!
            age: Int!
            actedIn: [${AmatureProduction}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "AppearsIn")
        }
    `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: gqlQuery,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();
        expect(
            (gqlResult.data?.["productions"] as any).find((r) => r.title === amatureProductionTitle).actorsConnection
                .edges
        ).toIncludeSameMembers([
            {
                node: {
                    name: untrainedPersonName,
                    age: 20,
                    actedInConnection: {
                        edges: expect.toIncludeSameMembers([
                            {
                                node: {
                                    title: amatureProductionTitle,
                                    episodeCount: seriesEpisodes,
                                },
                                properties: {
                                    sceneNr,
                                },
                            },
                        ]),
                    },
                },
                properties: {
                    screenTime: seriesScreenTime,
                },
            },
        ]);
    });
    test("connection field has relationship to the other one narrowed type only", async () => {
        const typeDefs = gql`
        interface Production {
            title: String!
            actors: [Person!]! @declareRelationship
        }

        type ${Movie} implements Production {
            title: String!
            runtime: Int!
            actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ${AmatureProduction} implements Production {
            title: String!
            episodeCount: Int!
            actors: [${UntrainedPerson}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ActedIn @relationshipProperties {
            screenTime: Int!
        }

        type AppearsIn @relationshipProperties {
            sceneNr: Int!
        }

        interface Person {
            name: String!
            actedIn: [Production!]! @declareRelationship
        }

        type ${Actor} implements Person {
            name: String!
            moviesCnt: Int!
            actedIn: [${Movie}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
        }

        type ${UntrainedPerson} implements Person {
            name: String!
            age: Int!
            actedIn: [${Movie}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "AppearsIn")
        }
    `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: gqlQuery,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();
        expect(
            (gqlResult.data?.["productions"] as any).find((r) => r.title === amatureProductionTitle).actorsConnection
                .edges
        ).toIncludeSameMembers([
            {
                node: {
                    name: untrainedPersonName,
                    age: 20,
                    actedInConnection: {
                        edges: expect.toIncludeSameMembers([
                            {
                                node: {
                                    title: movieTitle2,
                                    runtime: movieRuntime,
                                },
                                properties: {
                                    sceneNr,
                                },
                            },
                        ]),
                    },
                },
                properties: {
                    screenTime: seriesScreenTime,
                },
            },
        ]);
    });
    test("connection field has relationship to interface directly", async () => {
        const typeDefs = gql`
        interface Production {
            title: String!
            actors: [Person!]! @declareRelationship
        }

        type ${Movie} implements Production {
            title: String!
            runtime: Int!
            actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ${AmatureProduction} implements Production {
            title: String!
            episodeCount: Int!
            actors: [${UntrainedPerson}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ActedIn @relationshipProperties {
            screenTime: Int!
        }

        type AppearsIn @relationshipProperties {
            sceneNr: Int!
        }

        interface Person {
            name: String!
            actedIn: [Production!]! @declareRelationship
        }

        type ${Actor} implements Person {
            name: String!
            moviesCnt: Int!
            actedIn: [${Movie}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
        }

        type ${UntrainedPerson} implements Person {
            name: String!
            age: Int!
            actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "AppearsIn")
        }
    `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: gqlQuery,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();
        expect(
            (gqlResult.data?.["productions"] as any).find((r) => r.title === amatureProductionTitle).actorsConnection
                .edges
        ).toIncludeSameMembers([
            {
                node: {
                    name: untrainedPersonName,
                    age: 20,
                    actedInConnection: {
                        edges: expect.toIncludeSameMembers([
                            {
                                node: {
                                    title: movieTitle2,
                                    runtime: movieRuntime,
                                },
                                properties: {
                                    sceneNr,
                                },
                            },
                            {
                                node: {
                                    title: amatureProductionTitle,
                                    episodeCount: seriesEpisodes,
                                },
                                properties: {
                                    sceneNr,
                                },
                            },
                        ]),
                    },
                },
                properties: {
                    screenTime: seriesScreenTime,
                },
            },
        ]);
    });
    test("concrete.interfaceConnection edge filter works for the correct propertiesTypeName", async () => {
        const typeDefs = gql`
        interface Production {
            title: String!
            actors: [Person!]! @declareRelationship
        }

        type ${Movie} implements Production {
            title: String!
            runtime: Int!
            actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ${AmatureProduction} implements Production {
            title: String!
            episodeCount: Int!
            actors: [${UntrainedPerson}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ActedIn @relationshipProperties {
            screenTime: Int!
        }

        type AppearsIn @relationshipProperties {
            sceneNr: Int!
        }

        interface Person {
            name: String!
            actedIn: [Production!]! @declareRelationship
        }

        type ${Actor} implements Person {
            name: String!
            moviesCnt: Int!
            actedIn: [${Movie}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
        }

        type ${UntrainedPerson} implements Person {
            name: String!
            age: Int!
            actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "AppearsIn")
        }
    `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });

        const filterQuery = /* GraphQL */ `
        query UntrainedPeople {
            ${UntrainedPerson.plural} {
                name
                actedInConnection(where: { edge: { AppearsIn: { sceneNr: 0 } } }) {
                    edges {
                        node {
                            title
                            ... on ${Movie} {
                                runtime
                            }
                            ... on ${AmatureProduction} {
                                episodeCount
                            }
                        }
                        properties {
                            ... on ActedIn {
                                screenTime
                            }
                           ... on AppearsIn {
                                sceneNr
                           }
                        }
                    }
                }
            }
        }
    `;

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: filterQuery,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();
        expect(gqlResult.data?.[UntrainedPerson.plural]).toIncludeSameMembers([
            {
                name: untrainedPersonName,
                actedInConnection: {
                    edges: [],
                },
            },
        ]);
    });
    test("concrete.interfaceConnection edge filter ignores the incorrect propertiesTypeName (Person.actedIn can have ActedIn properties but UntrainedPerson.actedIn can only have AppearsIn)", async () => {
        const typeDefs = gql`
        interface Production {
            title: String!
            actors: [Person!]! @declareRelationship
        }

        type ${Movie} implements Production {
            title: String!
            runtime: Int!
            actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ${AmatureProduction} implements Production {
            title: String!
            episodeCount: Int!
            actors: [${UntrainedPerson}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
        }

        type ActedIn @relationshipProperties {
            screenTime: Int!
        }

        type AppearsIn @relationshipProperties {
            sceneNr: Int!
        }

        interface Person {
            name: String!
            actedIn: [Production!]! @declareRelationship
        }

        type ${Actor} implements Person {
            name: String!
            moviesCnt: Int!
            actedIn: [${Movie}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
        }

        type ${UntrainedPerson} implements Person {
            name: String!
            age: Int!
            actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "AppearsIn")
        }
    `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });

        const filterQuery = /* GraphQL */ `
        query UntrainedPeople {
            ${UntrainedPerson.plural} {
                name
                actedInConnection(where: { edge: { AppearsIn: { sceneNr: ${sceneNr} }, ActedIn: {screenTime: ${movieScreenTime}} } }) {
                    edges {
                        node {
                            title
                            ... on ${Movie} {
                                runtime
                            }
                            ... on ${AmatureProduction} {
                                episodeCount
                            }
                        }
                        properties {
                            ... on ActedIn {
                                screenTime
                            }
                           ... on AppearsIn {
                                sceneNr
                           }
                        }
                    }
                }
            }
        }
    `;

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: filterQuery,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();
        expect(gqlResult.data?.[UntrainedPerson.plural]).toIncludeSameMembers([
            {
                name: untrainedPersonName,
                actedInConnection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                title: amatureProductionTitle,
                                episodeCount: seriesEpisodes,
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                        {
                            node: {
                                title: movieTitle2,
                                runtime: movieRuntime,
                            },
                            properties: {
                                sceneNr,
                            },
                        },
                    ]),
                },
            },
        ]);
    });
});

// TODO: maybe combine with describe above bc there are multiple typedefs
describe("type narrowing - mutations setup", () => {
    let driver: Driver;
    let neo4j: Neo4j;
    let session: Session;
    let neoSchema: Neo4jGraphQL;

    let Movie: UniqueType;
    let AmatureProduction: UniqueType;
    let Actor: UniqueType;
    let UntrainedPerson: UniqueType;

    beforeAll(async () => {
        neo4j = new Neo4j();
        driver = await neo4j.getDriver();
    });

    beforeEach(async () => {
        Movie = new UniqueType("Movie");
        AmatureProduction = new UniqueType("AmatureProduction");
        Actor = new UniqueType("Actor");
        UntrainedPerson = new UniqueType("UntrainedPerson");
        session = await neo4j.getSession();

        const typeDefs = gql`
            interface Production {
                title: String!
                actors: [Person!]! @declareRelationship
            }

            type ${Movie} implements Production {
                title: String!
                runtime: Int!
                actors: [${Actor}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "ActedIn")
            }

            type ${AmatureProduction} implements Production {
                title: String!
                episodeCount: Int!
                actors: [${UntrainedPerson}!]! @relationship(type: "ACTED_IN", direction: IN, properties: "AppearsIn")
            }

            type ActedIn @relationshipProperties {
                screenTime: Int!
            }

            type AppearsIn @relationshipProperties {
                sceneNr: Int!
            }

            interface Person {
                name: String!
                actedIn: [Production!]! @declareRelationship
            }

            type ${Actor} implements Person {
                name: String!
                moviesCnt: Int!
                actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
            }

            type ${UntrainedPerson} implements Person {
                name: String!
                age: Int!
                actedIn: [${AmatureProduction}!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "AppearsIn")
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
    });

    afterEach(async () => {
        await session.run(
            `
                MATCH(a:${Movie})
                MATCH(b:${AmatureProduction})
                MATCH(c:${Actor})
                MATCH(d:${UntrainedPerson})

                DETACH DELETE a
                DETACH DELETE b
                DETACH DELETE c
                DETACH DELETE d
            `
        );
        await session.close();
    });

    afterAll(async () => {
        await driver.close();
    });

    // update -> update -> edge
    test("update interface relationship, update edge", async () => {
        const actorName = "actor1";
        const actorName2 = "actor2";
        const untrainedPersonName = "someone";

        const movieTitle = "movie1";
        const movieTitle2 = "movie2";
        const movieRuntime = faker.number.int({ max: 100000 });
        const movieScreenTime = faker.number.int({ max: 100000 });

        const seriesTitle = "series1";
        const seriesEpisodes = faker.number.int({ max: 100000 });
        const seriesScreenTime = faker.number.int({ max: 100000 });
        const sceneNr = faker.number.int({ max: 100000 });

        const query = /* GraphQL */ `
        mutation {
            ${Actor.operations.update}(update: { actedIn: [{ update: { node: { actors: [{ update: { edge: { ActedIn: { screenTime: 0 } } } }] } } }] }) {
                ${Actor.plural} {
                    name
                    actedInConnection {
                        edges {
                            node {
                                title
                                actorsConnection {
                                    edges {
                                        node {
                                            name
                                            actedInConnection {
                                                edges {
                                                    node {
                                                        title
                                                        ... on ${Movie} {
                                                            runtime
                                                        }
                                                        ... on ${AmatureProduction} {
                                                            episodeCount
                                                        }
                                                    }
                                                    properties {
                                                        ... on ActedIn {
                                                            screenTime
                                                        }
                                                        ... on AppearsIn {
                                                            sceneNr
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        properties {
                                            ... on ActedIn {
                                                screenTime
                                            }
                                            ... on AppearsIn {
                                                sceneNr
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

        await session.run(
            `
            CREATE (a:${Actor} { name: $actorName })
            CREATE (a2:${Actor} { name: $actorName2 })
            CREATE (up:${UntrainedPerson} { name: $untrainedPersonName })
            CREATE (m:${Movie} { title: $movieTitle, runtime:$movieRuntime })
            CREATE (m2:${Movie} { title: $movieTitle2, runtime:$movieRuntime })
            CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m)
            CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
            CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
            CREATE (ap:${AmatureProduction} { title: $seriesTitle, episodeCount: $seriesEpisodes })
            CREATE (up)-[:ACTED_IN { sceneNr: $sceneNr }]->(ap)
            CREATE (a)-[:ACTED_IN { sceneNr: $sceneNr, screenTime: $movieScreenTime }]->(ap)
        `,
            {
                actorName,
                actorName2,
                movieTitle,
                movieTitle2,
                movieRuntime,
                movieScreenTime,
                seriesTitle,
                seriesEpisodes,
                seriesScreenTime,
                sceneNr,
                untrainedPersonName,
            }
        );

        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query,
            contextValue: neo4j.getContextValues(),
            variableValues: {},
        });

        expect(gqlResult.errors).toBeFalsy();

        console.log(">", JSON.stringify(gqlResult.data?.[Actor.operations.update]));

        expect((gqlResult.data?.[Actor.operations.update] as Record<string, any>)?.[Actor.plural]).toIncludeSameMembers(
            [
                {
                    name: actorName,
                    actedInConnection: {
                        edges: expect.toIncludeSameMembers([
                            {
                                node: {
                                    title: movieTitle2,
                                    actorsConnection: {
                                        edges: expect.toIncludeSameMembers([
                                            {
                                                node: {
                                                    name: actorName2,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                        ]),
                                    },
                                },
                            },
                            {
                                node: {
                                    title: movieTitle,
                                    actorsConnection: {
                                        edges: [
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                        ],
                                    },
                                },
                            },
                            {
                                node: {
                                    title: seriesTitle,
                                    actorsConnection: {
                                        edges: [
                                            {
                                                node: {
                                                    name: untrainedPersonName,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { sceneNr },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { sceneNr },
                                            },
                                        ],
                                    },
                                },
                            },
                        ]),
                    },
                },
                {
                    name: actorName2,
                    actedInConnection: {
                        edges: [
                            {
                                node: {
                                    title: movieTitle2,
                                    actorsConnection: {
                                        edges: expect.toIncludeSameMembers([
                                            {
                                                node: {
                                                    name: actorName2,
                                                    actedInConnection: {
                                                        edges: [
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                        ],
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                            {
                                                node: {
                                                    name: actorName,
                                                    actedInConnection: {
                                                        edges: expect.toIncludeSameMembers([
                                                            {
                                                                node: { title: movieTitle2, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: { title: movieTitle, runtime: movieRuntime },
                                                                properties: { screenTime: 0 },
                                                            },
                                                            {
                                                                node: {
                                                                    title: seriesTitle,
                                                                    episodeCount: seriesEpisodes,
                                                                },
                                                                properties: { screenTime: movieScreenTime },
                                                            },
                                                        ]),
                                                    },
                                                },
                                                properties: { screenTime: 0 },
                                            },
                                        ]),
                                    },
                                },
                            },
                        ],
                    },
                },
            ]
        );
    });
});

// TODO: mutations for all suites
// TODO: simple query version of all connection operations
