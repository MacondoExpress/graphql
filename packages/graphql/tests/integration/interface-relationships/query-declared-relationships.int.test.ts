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
import { graphql } from "graphql";
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
            query production {
                productions {
                    title
                    actorsConnection {
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
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
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
        expect(gqlResult.data?.productions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    title: movieTitle,
                    actorsConnection: {
                        edges: [
                            {
                                node: {
                                    name: actorName,
                                },
                                properties: {
                                    screenTime: movieScreenTime,
                                },
                            },
                        ],
                    },
                }),
                expect.objectContaining({
                    title: movieTitle2,
                    actorsConnection: {
                        edges: expect.arrayContaining([
                            {
                                node: {
                                    name: actorName,
                                },
                                properties: {
                                    screenTime: movieScreenTime,
                                },
                            },
                            {
                                node: {
                                    name: actorName2,
                                },
                                properties: {
                                    screenTime: movieScreenTime,
                                },
                            },
                        ]),
                    },
                }),
                expect.objectContaining({
                    title: seriesTitle,
                    actorsConnection: {
                        edges: [
                            {
                                node: {
                                    name: actorName,
                                },
                                properties: {
                                    episodeNr,
                                },
                            },
                        ],
                    },
                }),
            ])
        );
    });

    test("should filter using relationship filters", async () => {
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
            query production {
                productions(where: { actors_SOME: { name: "${actorName2}" } }) {
                    title
                    actorsConnection {
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
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
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
        expect(gqlResult.data?.productions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    title: movieTitle2,
                    actorsConnection: {
                        edges: expect.arrayContaining([
                            {
                                node: {
                                    name: actorName,
                                },
                                properties: {
                                    screenTime: movieScreenTime,
                                },
                            },
                            {
                                node: {
                                    name: actorName2,
                                },
                                properties: {
                                    screenTime: movieScreenTime,
                                },
                            },
                        ]),
                    },
                }),
            ])
        );
    });

    test("should filter using connection filters", async () => {
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
            query production {
                productions(where: { actorsConnection_SOME: { node: { name: "${actorName2}" } } }) {
                    title
                    actorsConnection {
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
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
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
        expect(gqlResult.data?.productions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    title: movieTitle2,
                    actorsConnection: {
                        edges: expect.arrayContaining([
                            {
                                node: {
                                    name: actorName,
                                },
                                properties: {
                                    screenTime: movieScreenTime,
                                },
                            },
                            {
                                node: {
                                    name: actorName2,
                                },
                                properties: {
                                    screenTime: movieScreenTime,
                                },
                            },
                        ]),
                    },
                }),
            ])
        );
    });

    test("should filter using connection filters + typename_IN + logical", async () => {
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
            query production {
                productions(where: { OR: [{ typename_IN: [${Series}] }, {actorsConnection_SOME: { node: { name: "${actorName2}" }  }}] }) {
                    title
                    actorsConnection {
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
                CREATE (a)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a2)-[:ACTED_IN { screenTime: $movieScreenTime }]->(m2)
                CREATE (a)-[:ACTED_IN { episodeNr: $episodeNr }]->(:${Series} { title: $seriesTitle, episodeCount: $seriesEpisodes })
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
        expect(gqlResult.data?.productions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    title: movieTitle2,
                    actorsConnection: {
                        edges: expect.arrayContaining([
                            {
                                node: {
                                    name: actorName,
                                },
                                properties: {
                                    screenTime: movieScreenTime,
                                },
                            },
                            {
                                node: {
                                    name: actorName2,
                                },
                                properties: {
                                    screenTime: movieScreenTime,
                                },
                            },
                        ]),
                    },
                }),
                expect.objectContaining({
                    title: seriesTitle,
                    actorsConnection: {
                        edges: [
                            {
                                node: {
                                    name: actorName,
                                },
                                properties: {
                                    episodeNr,
                                },
                            },
                        ],
                    },
                }),
            ])
        );
    });
});
