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

import type { UniqueType } from "../../../../../utils/graphql-types";
import { TestHelper } from "../../../../../utils/tests-helper";

describe("Point 3d", () => {
    const testHelper = new TestHelper({ v6Api: true });

    let Location: UniqueType;
    const London = { longitude: -0.127758, latitude: 51.507351, height: 24 };
    const Rome = { longitude: 12.496365, latitude: 41.902782, height: 35 };

    beforeEach(async () => {
        Location = testHelper.createUniqueType("Location");

        const typeDefs = /* GraphQL */ `
            type ${Location} @node {
                id: ID!
                value: Point!
            }
        `;
        await testHelper.executeCypher(
            `
                CREATE (:${Location} { id: "1", value: point($London)})
                CREATE (:${Location} { id: "2", value: point($Rome)})
            `,
            { London, Rome }
        );
        await testHelper.initNeo4jGraphQL({ typeDefs });
    });

    afterEach(async () => {
        await testHelper.close();
    });

    test("wgs-84-3d point", async () => {
        const query = /* GraphQL */ `
            query {
                ${Location.plural} {
                    connection {
                        edges {
                            node {
                                id
                                value {
                                    latitude
                                    longitude
                                    height
                                    crs
                                    srid
                                }
                            }
                        }
                    }
                   
                }
            }
        `;

        const queryResult = await testHelper.executeGraphQL(query);

        expect(queryResult.errors).toBeFalsy();
        expect(queryResult.data).toEqual({
            [Location.plural]: {
                connection: {
                    edges: expect.toIncludeSameMembers([
                        {
                            node: {
                                id: "1",
                                value: {
                                    latitude: London.latitude,
                                    longitude: London.longitude,
                                    height: London.height,
                                    crs: "wgs-84-3d",
                                    srid: 4979,
                                },
                            },
                        },
                        {
                            node: {
                                id: "2",
                                value: {
                                    latitude: Rome.latitude,
                                    longitude: Rome.longitude,
                                    height: Rome.height,
                                    crs: "wgs-84-3d",
                                    srid: 4979,
                                },
                            },
                        },
                    ]),
                },
            },
        });
    });
});
