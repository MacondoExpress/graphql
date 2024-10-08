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

import { printSchemaWithDirectives } from "@graphql-tools/utils";
import { gql } from "graphql-tag";
import { lexicographicSortSchema } from "graphql/utilities";
import { Neo4jGraphQL } from "../../../src";

describe("Implicit Equality filters", () => {
    test("Should remove implicitEqualFilters if specified by the settings", async () => {
        const typeDefs = /* GraphQL */ `
            type Movie @node {
                id: ID
                title: String
                actorCount: Int
                averageRating: Float
                isActive: Boolean
                viewers: BigInt
                location: Point
                geoLocation: CartesianPoint
                alternativeTitles: [String]
                released: Date
            }
        `;
        const neoSchema = new Neo4jGraphQL({
            typeDefs,
            features: {
                excludeDeprecatedFields: {
                    implicitEqualFilters: false,
                    bookmark: true,
                    arrayFilters: true,
                    stringAggregation: true,
                    aggregationFilters: true,
                },
            },
        });
        const printedSchema = printSchemaWithDirectives(lexicographicSortSchema(await neoSchema.getSchema()));

        expect(printedSchema).toMatchInlineSnapshot(`
            "schema {
              query: Query
              mutation: Mutation
            }

            \\"\\"\\"
            A BigInt value up to 64 bits in size, which can be a number or a string if used inline, or a string only if used as a variable. Always returned as a string.
            \\"\\"\\"
            scalar BigInt

            type BigIntAggregateSelection {
              average: BigInt
              max: BigInt
              min: BigInt
              sum: BigInt
            }

            \\"\\"\\"
            A point in a two- or three-dimensional Cartesian coordinate system or in a three-dimensional cylindrical coordinate system. For more information, see https://neo4j.com/docs/graphql/4/type-definitions/types/spatial/#cartesian-point
            \\"\\"\\"
            type CartesianPoint {
              crs: String!
              srid: Int!
              x: Float!
              y: Float!
              z: Float
            }

            \\"\\"\\"Input type for a cartesian point with a distance\\"\\"\\"
            input CartesianPointDistance {
              distance: Float!
              point: CartesianPointInput!
            }

            \\"\\"\\"Input type for a cartesian point\\"\\"\\"
            input CartesianPointInput {
              x: Float!
              y: Float!
              z: Float
            }

            \\"\\"\\"
            Information about the number of nodes and relationships created during a create mutation
            \\"\\"\\"
            type CreateInfo {
              nodesCreated: Int!
              relationshipsCreated: Int!
            }

            type CreateMoviesMutationResponse {
              info: CreateInfo!
              movies: [Movie!]!
            }

            \\"\\"\\"A date, represented as a 'yyyy-mm-dd' string\\"\\"\\"
            scalar Date

            \\"\\"\\"
            Information about the number of nodes and relationships deleted during a delete mutation
            \\"\\"\\"
            type DeleteInfo {
              nodesDeleted: Int!
              relationshipsDeleted: Int!
            }

            type FloatAggregateSelection {
              average: Float
              max: Float
              min: Float
              sum: Float
            }

            type IDAggregateSelection {
              longest: ID
              shortest: ID
            }

            type IntAggregateSelection {
              average: Float
              max: Int
              min: Int
              sum: Int
            }

            type Movie {
              actorCount: Int
              alternativeTitles: [String]
              averageRating: Float
              geoLocation: CartesianPoint
              id: ID
              isActive: Boolean
              location: Point
              released: Date
              title: String
              viewers: BigInt
            }

            type MovieAggregateSelection {
              actorCount: IntAggregateSelection!
              averageRating: FloatAggregateSelection!
              count: Int!
              id: IDAggregateSelection!
              title: StringAggregateSelection!
              viewers: BigIntAggregateSelection!
            }

            input MovieCreateInput {
              actorCount: Int
              alternativeTitles: [String]
              averageRating: Float
              geoLocation: CartesianPointInput
              id: ID
              isActive: Boolean
              location: PointInput
              released: Date
              title: String
              viewers: BigInt
            }

            type MovieEdge {
              cursor: String!
              node: Movie!
            }

            input MovieOptions {
              limit: Int
              offset: Int
              \\"\\"\\"
              Specify one or more MovieSort objects to sort Movies by. The sorts will be applied in the order in which they are arranged in the array.
              \\"\\"\\"
              sort: [MovieSort!]
            }

            \\"\\"\\"
            Fields to sort Movies by. The order in which sorts are applied is not guaranteed when specifying many fields in one MovieSort object.
            \\"\\"\\"
            input MovieSort {
              actorCount: SortDirection
              averageRating: SortDirection
              geoLocation: SortDirection
              id: SortDirection
              isActive: SortDirection
              location: SortDirection
              released: SortDirection
              title: SortDirection
              viewers: SortDirection
            }

            input MovieUpdateInput {
              actorCount: Int
              actorCount_DECREMENT: Int
              actorCount_INCREMENT: Int
              alternativeTitles: [String]
              alternativeTitles_POP: Int
              alternativeTitles_PUSH: [String]
              averageRating: Float
              averageRating_ADD: Float
              averageRating_DIVIDE: Float
              averageRating_MULTIPLY: Float
              averageRating_SUBTRACT: Float
              geoLocation: CartesianPointInput
              id: ID
              isActive: Boolean
              location: PointInput
              released: Date
              title: String
              viewers: BigInt
              viewers_DECREMENT: BigInt
              viewers_INCREMENT: BigInt
            }

            input MovieWhere {
              AND: [MovieWhere!]
              NOT: MovieWhere
              OR: [MovieWhere!]
              actorCount: Int @deprecated(reason: \\"Please use the explicit _EQ version\\")
              actorCount_EQ: Int
              actorCount_GT: Int
              actorCount_GTE: Int
              actorCount_IN: [Int]
              actorCount_LT: Int
              actorCount_LTE: Int
              alternativeTitles: [String] @deprecated(reason: \\"Please use the explicit _EQ version\\")
              alternativeTitles_EQ: [String]
              alternativeTitles_INCLUDES: String
              averageRating: Float @deprecated(reason: \\"Please use the explicit _EQ version\\")
              averageRating_EQ: Float
              averageRating_GT: Float
              averageRating_GTE: Float
              averageRating_IN: [Float]
              averageRating_LT: Float
              averageRating_LTE: Float
              geoLocation: CartesianPointInput @deprecated(reason: \\"Please use the explicit _EQ version\\")
              geoLocation_DISTANCE: CartesianPointDistance
              geoLocation_EQ: CartesianPointInput
              geoLocation_GT: CartesianPointDistance
              geoLocation_GTE: CartesianPointDistance
              geoLocation_IN: [CartesianPointInput]
              geoLocation_LT: CartesianPointDistance
              geoLocation_LTE: CartesianPointDistance
              id: ID @deprecated(reason: \\"Please use the explicit _EQ version\\")
              id_CONTAINS: ID
              id_ENDS_WITH: ID
              id_EQ: ID
              id_IN: [ID]
              id_STARTS_WITH: ID
              isActive: Boolean @deprecated(reason: \\"Please use the explicit _EQ version\\")
              isActive_EQ: Boolean
              location: PointInput @deprecated(reason: \\"Please use the explicit _EQ version\\")
              location_DISTANCE: PointDistance
              location_EQ: PointInput
              location_GT: PointDistance
              location_GTE: PointDistance
              location_IN: [PointInput]
              location_LT: PointDistance
              location_LTE: PointDistance
              released: Date @deprecated(reason: \\"Please use the explicit _EQ version\\")
              released_EQ: Date
              released_GT: Date
              released_GTE: Date
              released_IN: [Date]
              released_LT: Date
              released_LTE: Date
              title: String @deprecated(reason: \\"Please use the explicit _EQ version\\")
              title_CONTAINS: String
              title_ENDS_WITH: String
              title_EQ: String
              title_IN: [String]
              title_STARTS_WITH: String
              viewers: BigInt @deprecated(reason: \\"Please use the explicit _EQ version\\")
              viewers_EQ: BigInt
              viewers_GT: BigInt
              viewers_GTE: BigInt
              viewers_IN: [BigInt]
              viewers_LT: BigInt
              viewers_LTE: BigInt
            }

            type MoviesConnection {
              edges: [MovieEdge!]!
              pageInfo: PageInfo!
              totalCount: Int!
            }

            type Mutation {
              createMovies(input: [MovieCreateInput!]!): CreateMoviesMutationResponse!
              deleteMovies(where: MovieWhere): DeleteInfo!
              updateMovies(update: MovieUpdateInput, where: MovieWhere): UpdateMoviesMutationResponse!
            }

            \\"\\"\\"Pagination information (Relay)\\"\\"\\"
            type PageInfo {
              endCursor: String
              hasNextPage: Boolean!
              hasPreviousPage: Boolean!
              startCursor: String
            }

            \\"\\"\\"
            A point in a coordinate system. For more information, see https://neo4j.com/docs/graphql/4/type-definitions/types/spatial/#point
            \\"\\"\\"
            type Point {
              crs: String!
              height: Float
              latitude: Float!
              longitude: Float!
              srid: Int!
            }

            \\"\\"\\"Input type for a point with a distance\\"\\"\\"
            input PointDistance {
              \\"\\"\\"The distance in metres to be used when comparing two points\\"\\"\\"
              distance: Float!
              point: PointInput!
            }

            \\"\\"\\"Input type for a point\\"\\"\\"
            input PointInput {
              height: Float
              latitude: Float!
              longitude: Float!
            }

            type Query {
              movies(limit: Int, offset: Int, options: MovieOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [MovieSort!], where: MovieWhere): [Movie!]!
              moviesAggregate(where: MovieWhere): MovieAggregateSelection!
              moviesConnection(after: String, first: Int, sort: [MovieSort!], where: MovieWhere): MoviesConnection!
            }

            \\"\\"\\"An enum for sorting in either ascending or descending order.\\"\\"\\"
            enum SortDirection {
              \\"\\"\\"Sort by field values in ascending order.\\"\\"\\"
              ASC
              \\"\\"\\"Sort by field values in descending order.\\"\\"\\"
              DESC
            }

            type StringAggregateSelection {
              longest: String
              shortest: String
            }

            \\"\\"\\"
            Information about the number of nodes and relationships created and deleted during an update mutation
            \\"\\"\\"
            type UpdateInfo {
              nodesCreated: Int!
              nodesDeleted: Int!
              relationshipsCreated: Int!
              relationshipsDeleted: Int!
            }

            type UpdateMoviesMutationResponse {
              info: UpdateInfo!
              movies: [Movie!]!
            }"
        `);
    });

    describe("Relationship", () => {
        test("Simple", async () => {
            const typeDefs = gql`
                type Actor @node {
                    name: String
                }

                type Movie @node {
                    id: ID
                    "Actors in Movie"
                    actors: [Actor!]! @relationship(type: "ACTED_IN", direction: IN)
                }
            `;
            const neoSchema = new Neo4jGraphQL({
                typeDefs,
                features: {
                    excludeDeprecatedFields: {
                        bookmark: true,
                        arrayFilters: true,
                        stringAggregation: true,
                        aggregationFilters: true,
                    },
                },
            });
            const printedSchema = printSchemaWithDirectives(lexicographicSortSchema(await neoSchema.getSchema()));

            expect(printedSchema).toMatchInlineSnapshot(`
                "schema {
                  query: Query
                  mutation: Mutation
                }

                type Actor {
                  name: String
                }

                type ActorAggregateSelection {
                  count: Int!
                  name: StringAggregateSelection!
                }

                input ActorConnectWhere {
                  node: ActorWhere!
                }

                input ActorCreateInput {
                  name: String
                }

                type ActorEdge {
                  cursor: String!
                  node: Actor!
                }

                input ActorOptions {
                  limit: Int
                  offset: Int
                  \\"\\"\\"
                  Specify one or more ActorSort objects to sort Actors by. The sorts will be applied in the order in which they are arranged in the array.
                  \\"\\"\\"
                  sort: [ActorSort!]
                }

                \\"\\"\\"
                Fields to sort Actors by. The order in which sorts are applied is not guaranteed when specifying many fields in one ActorSort object.
                \\"\\"\\"
                input ActorSort {
                  name: SortDirection
                }

                input ActorUpdateInput {
                  name: String
                }

                input ActorWhere {
                  AND: [ActorWhere!]
                  NOT: ActorWhere
                  OR: [ActorWhere!]
                  name: String @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  name_CONTAINS: String
                  name_ENDS_WITH: String
                  name_EQ: String
                  name_IN: [String]
                  name_STARTS_WITH: String
                }

                type ActorsConnection {
                  edges: [ActorEdge!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                type CreateActorsMutationResponse {
                  actors: [Actor!]!
                  info: CreateInfo!
                }

                \\"\\"\\"
                Information about the number of nodes and relationships created during a create mutation
                \\"\\"\\"
                type CreateInfo {
                  nodesCreated: Int!
                  relationshipsCreated: Int!
                }

                type CreateMoviesMutationResponse {
                  info: CreateInfo!
                  movies: [Movie!]!
                }

                \\"\\"\\"
                Information about the number of nodes and relationships deleted during a delete mutation
                \\"\\"\\"
                type DeleteInfo {
                  nodesDeleted: Int!
                  relationshipsDeleted: Int!
                }

                type IDAggregateSelection {
                  longest: ID
                  shortest: ID
                }

                type Movie {
                  \\"\\"\\"Actors in Movie\\"\\"\\"
                  actors(directed: Boolean = true, limit: Int, offset: Int, options: ActorOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [ActorSort!], where: ActorWhere): [Actor!]!
                  actorsAggregate(directed: Boolean = true, where: ActorWhere): MovieActorActorsAggregationSelection
                  actorsConnection(after: String, directed: Boolean = true, first: Int, sort: [MovieActorsConnectionSort!], where: MovieActorsConnectionWhere): MovieActorsConnection!
                  id: ID
                }

                type MovieActorActorsAggregationSelection {
                  count: Int!
                  node: MovieActorActorsNodeAggregateSelection
                }

                type MovieActorActorsNodeAggregateSelection {
                  name: StringAggregateSelection!
                }

                input MovieActorsAggregateInput {
                  AND: [MovieActorsAggregateInput!]
                  NOT: MovieActorsAggregateInput
                  OR: [MovieActorsAggregateInput!]
                  count: Int @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  count_EQ: Int
                  count_GT: Int
                  count_GTE: Int
                  count_LT: Int
                  count_LTE: Int
                  node: MovieActorsNodeAggregationWhereInput
                }

                input MovieActorsConnectFieldInput {
                  \\"\\"\\"
                  Whether or not to overwrite any matching relationship with the new properties.
                  \\"\\"\\"
                  overwrite: Boolean! = true
                  where: ActorConnectWhere
                }

                type MovieActorsConnection {
                  edges: [MovieActorsRelationship!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                input MovieActorsConnectionSort {
                  node: ActorSort
                }

                input MovieActorsConnectionWhere {
                  AND: [MovieActorsConnectionWhere!]
                  NOT: MovieActorsConnectionWhere
                  OR: [MovieActorsConnectionWhere!]
                  node: ActorWhere
                }

                input MovieActorsCreateFieldInput {
                  node: ActorCreateInput!
                }

                input MovieActorsDeleteFieldInput {
                  where: MovieActorsConnectionWhere
                }

                input MovieActorsDisconnectFieldInput {
                  where: MovieActorsConnectionWhere
                }

                input MovieActorsFieldInput {
                  connect: [MovieActorsConnectFieldInput!]
                  create: [MovieActorsCreateFieldInput!]
                }

                input MovieActorsNodeAggregationWhereInput {
                  AND: [MovieActorsNodeAggregationWhereInput!]
                  NOT: MovieActorsNodeAggregationWhereInput
                  OR: [MovieActorsNodeAggregationWhereInput!]
                  name_AVERAGE_LENGTH_EQUAL: Float
                  name_AVERAGE_LENGTH_GT: Float
                  name_AVERAGE_LENGTH_GTE: Float
                  name_AVERAGE_LENGTH_LT: Float
                  name_AVERAGE_LENGTH_LTE: Float
                  name_LONGEST_LENGTH_EQUAL: Int
                  name_LONGEST_LENGTH_GT: Int
                  name_LONGEST_LENGTH_GTE: Int
                  name_LONGEST_LENGTH_LT: Int
                  name_LONGEST_LENGTH_LTE: Int
                  name_SHORTEST_LENGTH_EQUAL: Int
                  name_SHORTEST_LENGTH_GT: Int
                  name_SHORTEST_LENGTH_GTE: Int
                  name_SHORTEST_LENGTH_LT: Int
                  name_SHORTEST_LENGTH_LTE: Int
                }

                type MovieActorsRelationship {
                  cursor: String!
                  node: Actor!
                }

                input MovieActorsUpdateConnectionInput {
                  node: ActorUpdateInput
                }

                input MovieActorsUpdateFieldInput {
                  connect: [MovieActorsConnectFieldInput!]
                  create: [MovieActorsCreateFieldInput!]
                  delete: [MovieActorsDeleteFieldInput!]
                  disconnect: [MovieActorsDisconnectFieldInput!]
                  update: MovieActorsUpdateConnectionInput
                  where: MovieActorsConnectionWhere
                }

                type MovieAggregateSelection {
                  count: Int!
                  id: IDAggregateSelection!
                }

                input MovieConnectInput {
                  actors: [MovieActorsConnectFieldInput!]
                }

                input MovieCreateInput {
                  actors: MovieActorsFieldInput
                  id: ID
                }

                input MovieDeleteInput {
                  actors: [MovieActorsDeleteFieldInput!]
                }

                input MovieDisconnectInput {
                  actors: [MovieActorsDisconnectFieldInput!]
                }

                type MovieEdge {
                  cursor: String!
                  node: Movie!
                }

                input MovieOptions {
                  limit: Int
                  offset: Int
                  \\"\\"\\"
                  Specify one or more MovieSort objects to sort Movies by. The sorts will be applied in the order in which they are arranged in the array.
                  \\"\\"\\"
                  sort: [MovieSort!]
                }

                input MovieRelationInput {
                  actors: [MovieActorsCreateFieldInput!]
                }

                \\"\\"\\"
                Fields to sort Movies by. The order in which sorts are applied is not guaranteed when specifying many fields in one MovieSort object.
                \\"\\"\\"
                input MovieSort {
                  id: SortDirection
                }

                input MovieUpdateInput {
                  actors: [MovieActorsUpdateFieldInput!]
                  id: ID
                }

                input MovieWhere {
                  AND: [MovieWhere!]
                  NOT: MovieWhere
                  OR: [MovieWhere!]
                  actorsAggregate: MovieActorsAggregateInput
                  \\"\\"\\"
                  Return Movies where all of the related MovieActorsConnections match this filter
                  \\"\\"\\"
                  actorsConnection_ALL: MovieActorsConnectionWhere
                  \\"\\"\\"
                  Return Movies where none of the related MovieActorsConnections match this filter
                  \\"\\"\\"
                  actorsConnection_NONE: MovieActorsConnectionWhere
                  \\"\\"\\"
                  Return Movies where one of the related MovieActorsConnections match this filter
                  \\"\\"\\"
                  actorsConnection_SINGLE: MovieActorsConnectionWhere
                  \\"\\"\\"
                  Return Movies where some of the related MovieActorsConnections match this filter
                  \\"\\"\\"
                  actorsConnection_SOME: MovieActorsConnectionWhere
                  \\"\\"\\"Return Movies where all of the related Actors match this filter\\"\\"\\"
                  actors_ALL: ActorWhere
                  \\"\\"\\"Return Movies where none of the related Actors match this filter\\"\\"\\"
                  actors_NONE: ActorWhere
                  \\"\\"\\"Return Movies where one of the related Actors match this filter\\"\\"\\"
                  actors_SINGLE: ActorWhere
                  \\"\\"\\"Return Movies where some of the related Actors match this filter\\"\\"\\"
                  actors_SOME: ActorWhere
                  id: ID @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  id_CONTAINS: ID
                  id_ENDS_WITH: ID
                  id_EQ: ID
                  id_IN: [ID]
                  id_STARTS_WITH: ID
                }

                type MoviesConnection {
                  edges: [MovieEdge!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                type Mutation {
                  createActors(input: [ActorCreateInput!]!): CreateActorsMutationResponse!
                  createMovies(input: [MovieCreateInput!]!): CreateMoviesMutationResponse!
                  deleteActors(where: ActorWhere): DeleteInfo!
                  deleteMovies(delete: MovieDeleteInput, where: MovieWhere): DeleteInfo!
                  updateActors(update: ActorUpdateInput, where: ActorWhere): UpdateActorsMutationResponse!
                  updateMovies(connect: MovieConnectInput @deprecated(reason: \\"Top level connect input argument in update is deprecated. Use the nested connect field in the relationship within the update argument\\"), create: MovieRelationInput @deprecated(reason: \\"Top level create input argument in update is deprecated. Use the nested create field in the relationship within the update argument\\"), delete: MovieDeleteInput @deprecated(reason: \\"Top level delete input argument in update is deprecated. Use the nested delete field in the relationship within the update argument\\"), disconnect: MovieDisconnectInput @deprecated(reason: \\"Top level disconnect input argument in update is deprecated. Use the nested disconnect field in the relationship within the update argument\\"), update: MovieUpdateInput, where: MovieWhere): UpdateMoviesMutationResponse!
                }

                \\"\\"\\"Pagination information (Relay)\\"\\"\\"
                type PageInfo {
                  endCursor: String
                  hasNextPage: Boolean!
                  hasPreviousPage: Boolean!
                  startCursor: String
                }

                type Query {
                  actors(limit: Int, offset: Int, options: ActorOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [ActorSort!], where: ActorWhere): [Actor!]!
                  actorsAggregate(where: ActorWhere): ActorAggregateSelection!
                  actorsConnection(after: String, first: Int, sort: [ActorSort!], where: ActorWhere): ActorsConnection!
                  movies(limit: Int, offset: Int, options: MovieOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [MovieSort!], where: MovieWhere): [Movie!]!
                  moviesAggregate(where: MovieWhere): MovieAggregateSelection!
                  moviesConnection(after: String, first: Int, sort: [MovieSort!], where: MovieWhere): MoviesConnection!
                }

                \\"\\"\\"An enum for sorting in either ascending or descending order.\\"\\"\\"
                enum SortDirection {
                  \\"\\"\\"Sort by field values in ascending order.\\"\\"\\"
                  ASC
                  \\"\\"\\"Sort by field values in descending order.\\"\\"\\"
                  DESC
                }

                type StringAggregateSelection {
                  longest: String
                  shortest: String
                }

                type UpdateActorsMutationResponse {
                  actors: [Actor!]!
                  info: UpdateInfo!
                }

                \\"\\"\\"
                Information about the number of nodes and relationships created and deleted during an update mutation
                \\"\\"\\"
                type UpdateInfo {
                  nodesCreated: Int!
                  nodesDeleted: Int!
                  relationshipsCreated: Int!
                  relationshipsDeleted: Int!
                }

                type UpdateMoviesMutationResponse {
                  info: UpdateInfo!
                  movies: [Movie!]!
                }"
            `);
        });

        test("Interface", async () => {
            const typeDefs = gql`
                interface Production {
                    title: String!
                }

                type Movie implements Production @node {
                    title: String!
                    runtime: Int!
                }

                type Series implements Production @node {
                    title: String!
                    episodes: Int!
                }

                type ActedIn @relationshipProperties {
                    screenTime: Int!
                }

                type Actor @node {
                    name: String!
                    "Acted in Production"
                    actedIn: [Production!]! @relationship(type: "ACTED_IN", direction: OUT, properties: "ActedIn")
                }
            `;
            const neoSchema = new Neo4jGraphQL({
                typeDefs,
                features: {
                    excludeDeprecatedFields: {
                        bookmark: true,
                        arrayFilters: true,
                        stringAggregation: true,
                        aggregationFilters: true,
                    },
                },
            });
            const printedSchema = printSchemaWithDirectives(lexicographicSortSchema(await neoSchema.getSchema()));

            expect(printedSchema).toMatchInlineSnapshot(`
                "schema {
                  query: Query
                  mutation: Mutation
                }

                \\"\\"\\"
                The edge properties for the following fields:
                * Actor.actedIn
                \\"\\"\\"
                type ActedIn {
                  screenTime: Int!
                }

                input ActedInAggregationWhereInput {
                  AND: [ActedInAggregationWhereInput!]
                  NOT: ActedInAggregationWhereInput
                  OR: [ActedInAggregationWhereInput!]
                  screenTime_AVERAGE_EQUAL: Float
                  screenTime_AVERAGE_GT: Float
                  screenTime_AVERAGE_GTE: Float
                  screenTime_AVERAGE_LT: Float
                  screenTime_AVERAGE_LTE: Float
                  screenTime_MAX_EQUAL: Int
                  screenTime_MAX_GT: Int
                  screenTime_MAX_GTE: Int
                  screenTime_MAX_LT: Int
                  screenTime_MAX_LTE: Int
                  screenTime_MIN_EQUAL: Int
                  screenTime_MIN_GT: Int
                  screenTime_MIN_GTE: Int
                  screenTime_MIN_LT: Int
                  screenTime_MIN_LTE: Int
                  screenTime_SUM_EQUAL: Int
                  screenTime_SUM_GT: Int
                  screenTime_SUM_GTE: Int
                  screenTime_SUM_LT: Int
                  screenTime_SUM_LTE: Int
                }

                input ActedInCreateInput {
                  screenTime: Int!
                }

                input ActedInSort {
                  screenTime: SortDirection
                }

                input ActedInUpdateInput {
                  screenTime: Int
                  screenTime_DECREMENT: Int
                  screenTime_INCREMENT: Int
                }

                input ActedInWhere {
                  AND: [ActedInWhere!]
                  NOT: ActedInWhere
                  OR: [ActedInWhere!]
                  screenTime: Int @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  screenTime_EQ: Int
                  screenTime_GT: Int
                  screenTime_GTE: Int
                  screenTime_IN: [Int!]
                  screenTime_LT: Int
                  screenTime_LTE: Int
                }

                type Actor {
                  \\"\\"\\"Acted in Production\\"\\"\\"
                  actedIn(directed: Boolean = true, limit: Int, offset: Int, options: ProductionOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [ProductionSort!], where: ProductionWhere): [Production!]!
                  actedInAggregate(directed: Boolean = true, where: ProductionWhere): ActorProductionActedInAggregationSelection
                  actedInConnection(after: String, directed: Boolean = true, first: Int, sort: [ActorActedInConnectionSort!], where: ActorActedInConnectionWhere): ActorActedInConnection!
                  name: String!
                }

                input ActorActedInAggregateInput {
                  AND: [ActorActedInAggregateInput!]
                  NOT: ActorActedInAggregateInput
                  OR: [ActorActedInAggregateInput!]
                  count: Int @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  count_EQ: Int
                  count_GT: Int
                  count_GTE: Int
                  count_LT: Int
                  count_LTE: Int
                  edge: ActedInAggregationWhereInput
                  node: ActorActedInNodeAggregationWhereInput
                }

                input ActorActedInConnectFieldInput {
                  edge: ActedInCreateInput!
                  where: ProductionConnectWhere
                }

                type ActorActedInConnection {
                  edges: [ActorActedInRelationship!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                input ActorActedInConnectionSort {
                  edge: ActedInSort
                  node: ProductionSort
                }

                input ActorActedInConnectionWhere {
                  AND: [ActorActedInConnectionWhere!]
                  NOT: ActorActedInConnectionWhere
                  OR: [ActorActedInConnectionWhere!]
                  edge: ActedInWhere
                  node: ProductionWhere
                }

                input ActorActedInCreateFieldInput {
                  edge: ActedInCreateInput!
                  node: ProductionCreateInput!
                }

                input ActorActedInDeleteFieldInput {
                  where: ActorActedInConnectionWhere
                }

                input ActorActedInDisconnectFieldInput {
                  where: ActorActedInConnectionWhere
                }

                input ActorActedInFieldInput {
                  connect: [ActorActedInConnectFieldInput!]
                  create: [ActorActedInCreateFieldInput!]
                }

                input ActorActedInNodeAggregationWhereInput {
                  AND: [ActorActedInNodeAggregationWhereInput!]
                  NOT: ActorActedInNodeAggregationWhereInput
                  OR: [ActorActedInNodeAggregationWhereInput!]
                  title_AVERAGE_LENGTH_EQUAL: Float
                  title_AVERAGE_LENGTH_GT: Float
                  title_AVERAGE_LENGTH_GTE: Float
                  title_AVERAGE_LENGTH_LT: Float
                  title_AVERAGE_LENGTH_LTE: Float
                  title_LONGEST_LENGTH_EQUAL: Int
                  title_LONGEST_LENGTH_GT: Int
                  title_LONGEST_LENGTH_GTE: Int
                  title_LONGEST_LENGTH_LT: Int
                  title_LONGEST_LENGTH_LTE: Int
                  title_SHORTEST_LENGTH_EQUAL: Int
                  title_SHORTEST_LENGTH_GT: Int
                  title_SHORTEST_LENGTH_GTE: Int
                  title_SHORTEST_LENGTH_LT: Int
                  title_SHORTEST_LENGTH_LTE: Int
                }

                type ActorActedInRelationship {
                  cursor: String!
                  node: Production!
                  properties: ActedIn!
                }

                input ActorActedInUpdateConnectionInput {
                  edge: ActedInUpdateInput
                  node: ProductionUpdateInput
                }

                input ActorActedInUpdateFieldInput {
                  connect: [ActorActedInConnectFieldInput!]
                  create: [ActorActedInCreateFieldInput!]
                  delete: [ActorActedInDeleteFieldInput!]
                  disconnect: [ActorActedInDisconnectFieldInput!]
                  update: ActorActedInUpdateConnectionInput
                  where: ActorActedInConnectionWhere
                }

                type ActorAggregateSelection {
                  count: Int!
                  name: StringAggregateSelection!
                }

                input ActorConnectInput {
                  actedIn: [ActorActedInConnectFieldInput!]
                }

                input ActorCreateInput {
                  actedIn: ActorActedInFieldInput
                  name: String!
                }

                input ActorDeleteInput {
                  actedIn: [ActorActedInDeleteFieldInput!]
                }

                input ActorDisconnectInput {
                  actedIn: [ActorActedInDisconnectFieldInput!]
                }

                type ActorEdge {
                  cursor: String!
                  node: Actor!
                }

                input ActorOptions {
                  limit: Int
                  offset: Int
                  \\"\\"\\"
                  Specify one or more ActorSort objects to sort Actors by. The sorts will be applied in the order in which they are arranged in the array.
                  \\"\\"\\"
                  sort: [ActorSort!]
                }

                type ActorProductionActedInAggregationSelection {
                  count: Int!
                  edge: ActorProductionActedInEdgeAggregateSelection
                  node: ActorProductionActedInNodeAggregateSelection
                }

                type ActorProductionActedInEdgeAggregateSelection {
                  screenTime: IntAggregateSelection!
                }

                type ActorProductionActedInNodeAggregateSelection {
                  title: StringAggregateSelection!
                }

                input ActorRelationInput {
                  actedIn: [ActorActedInCreateFieldInput!]
                }

                \\"\\"\\"
                Fields to sort Actors by. The order in which sorts are applied is not guaranteed when specifying many fields in one ActorSort object.
                \\"\\"\\"
                input ActorSort {
                  name: SortDirection
                }

                input ActorUpdateInput {
                  actedIn: [ActorActedInUpdateFieldInput!]
                  name: String
                }

                input ActorWhere {
                  AND: [ActorWhere!]
                  NOT: ActorWhere
                  OR: [ActorWhere!]
                  actedInAggregate: ActorActedInAggregateInput
                  \\"\\"\\"
                  Return Actors where all of the related ActorActedInConnections match this filter
                  \\"\\"\\"
                  actedInConnection_ALL: ActorActedInConnectionWhere
                  \\"\\"\\"
                  Return Actors where none of the related ActorActedInConnections match this filter
                  \\"\\"\\"
                  actedInConnection_NONE: ActorActedInConnectionWhere
                  \\"\\"\\"
                  Return Actors where one of the related ActorActedInConnections match this filter
                  \\"\\"\\"
                  actedInConnection_SINGLE: ActorActedInConnectionWhere
                  \\"\\"\\"
                  Return Actors where some of the related ActorActedInConnections match this filter
                  \\"\\"\\"
                  actedInConnection_SOME: ActorActedInConnectionWhere
                  \\"\\"\\"Return Actors where all of the related Productions match this filter\\"\\"\\"
                  actedIn_ALL: ProductionWhere
                  \\"\\"\\"Return Actors where none of the related Productions match this filter\\"\\"\\"
                  actedIn_NONE: ProductionWhere
                  \\"\\"\\"Return Actors where one of the related Productions match this filter\\"\\"\\"
                  actedIn_SINGLE: ProductionWhere
                  \\"\\"\\"Return Actors where some of the related Productions match this filter\\"\\"\\"
                  actedIn_SOME: ProductionWhere
                  name: String @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  name_CONTAINS: String
                  name_ENDS_WITH: String
                  name_EQ: String
                  name_IN: [String!]
                  name_STARTS_WITH: String
                }

                type ActorsConnection {
                  edges: [ActorEdge!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                type CreateActorsMutationResponse {
                  actors: [Actor!]!
                  info: CreateInfo!
                }

                \\"\\"\\"
                Information about the number of nodes and relationships created during a create mutation
                \\"\\"\\"
                type CreateInfo {
                  nodesCreated: Int!
                  relationshipsCreated: Int!
                }

                type CreateMoviesMutationResponse {
                  info: CreateInfo!
                  movies: [Movie!]!
                }

                type CreateSeriesMutationResponse {
                  info: CreateInfo!
                  series: [Series!]!
                }

                \\"\\"\\"
                Information about the number of nodes and relationships deleted during a delete mutation
                \\"\\"\\"
                type DeleteInfo {
                  nodesDeleted: Int!
                  relationshipsDeleted: Int!
                }

                type IntAggregateSelection {
                  average: Float
                  max: Int
                  min: Int
                  sum: Int
                }

                type Movie implements Production {
                  runtime: Int!
                  title: String!
                }

                type MovieAggregateSelection {
                  count: Int!
                  runtime: IntAggregateSelection!
                  title: StringAggregateSelection!
                }

                input MovieCreateInput {
                  runtime: Int!
                  title: String!
                }

                type MovieEdge {
                  cursor: String!
                  node: Movie!
                }

                input MovieOptions {
                  limit: Int
                  offset: Int
                  \\"\\"\\"
                  Specify one or more MovieSort objects to sort Movies by. The sorts will be applied in the order in which they are arranged in the array.
                  \\"\\"\\"
                  sort: [MovieSort!]
                }

                \\"\\"\\"
                Fields to sort Movies by. The order in which sorts are applied is not guaranteed when specifying many fields in one MovieSort object.
                \\"\\"\\"
                input MovieSort {
                  runtime: SortDirection
                  title: SortDirection
                }

                input MovieUpdateInput {
                  runtime: Int
                  runtime_DECREMENT: Int
                  runtime_INCREMENT: Int
                  title: String
                }

                input MovieWhere {
                  AND: [MovieWhere!]
                  NOT: MovieWhere
                  OR: [MovieWhere!]
                  runtime: Int @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  runtime_EQ: Int
                  runtime_GT: Int
                  runtime_GTE: Int
                  runtime_IN: [Int!]
                  runtime_LT: Int
                  runtime_LTE: Int
                  title: String @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  title_CONTAINS: String
                  title_ENDS_WITH: String
                  title_EQ: String
                  title_IN: [String!]
                  title_STARTS_WITH: String
                }

                type MoviesConnection {
                  edges: [MovieEdge!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                type Mutation {
                  createActors(input: [ActorCreateInput!]!): CreateActorsMutationResponse!
                  createMovies(input: [MovieCreateInput!]!): CreateMoviesMutationResponse!
                  createSeries(input: [SeriesCreateInput!]!): CreateSeriesMutationResponse!
                  deleteActors(delete: ActorDeleteInput, where: ActorWhere): DeleteInfo!
                  deleteMovies(where: MovieWhere): DeleteInfo!
                  deleteSeries(where: SeriesWhere): DeleteInfo!
                  updateActors(connect: ActorConnectInput @deprecated(reason: \\"Top level connect input argument in update is deprecated. Use the nested connect field in the relationship within the update argument\\"), create: ActorRelationInput @deprecated(reason: \\"Top level create input argument in update is deprecated. Use the nested create field in the relationship within the update argument\\"), delete: ActorDeleteInput @deprecated(reason: \\"Top level delete input argument in update is deprecated. Use the nested delete field in the relationship within the update argument\\"), disconnect: ActorDisconnectInput @deprecated(reason: \\"Top level disconnect input argument in update is deprecated. Use the nested disconnect field in the relationship within the update argument\\"), update: ActorUpdateInput, where: ActorWhere): UpdateActorsMutationResponse!
                  updateMovies(update: MovieUpdateInput, where: MovieWhere): UpdateMoviesMutationResponse!
                  updateSeries(update: SeriesUpdateInput, where: SeriesWhere): UpdateSeriesMutationResponse!
                }

                \\"\\"\\"Pagination information (Relay)\\"\\"\\"
                type PageInfo {
                  endCursor: String
                  hasNextPage: Boolean!
                  hasPreviousPage: Boolean!
                  startCursor: String
                }

                interface Production {
                  title: String!
                }

                type ProductionAggregateSelection {
                  count: Int!
                  title: StringAggregateSelection!
                }

                input ProductionConnectWhere {
                  node: ProductionWhere!
                }

                input ProductionCreateInput {
                  Movie: MovieCreateInput
                  Series: SeriesCreateInput
                }

                type ProductionEdge {
                  cursor: String!
                  node: Production!
                }

                enum ProductionImplementation {
                  Movie
                  Series
                }

                input ProductionOptions {
                  limit: Int
                  offset: Int
                  \\"\\"\\"
                  Specify one or more ProductionSort objects to sort Productions by. The sorts will be applied in the order in which they are arranged in the array.
                  \\"\\"\\"
                  sort: [ProductionSort!]
                }

                \\"\\"\\"
                Fields to sort Productions by. The order in which sorts are applied is not guaranteed when specifying many fields in one ProductionSort object.
                \\"\\"\\"
                input ProductionSort {
                  title: SortDirection
                }

                input ProductionUpdateInput {
                  title: String
                }

                input ProductionWhere {
                  AND: [ProductionWhere!]
                  NOT: ProductionWhere
                  OR: [ProductionWhere!]
                  title: String @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  title_CONTAINS: String
                  title_ENDS_WITH: String
                  title_EQ: String
                  title_IN: [String!]
                  title_STARTS_WITH: String
                  typename_IN: [ProductionImplementation!]
                }

                type ProductionsConnection {
                  edges: [ProductionEdge!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                type Query {
                  actors(limit: Int, offset: Int, options: ActorOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [ActorSort!], where: ActorWhere): [Actor!]!
                  actorsAggregate(where: ActorWhere): ActorAggregateSelection!
                  actorsConnection(after: String, first: Int, sort: [ActorSort!], where: ActorWhere): ActorsConnection!
                  movies(limit: Int, offset: Int, options: MovieOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [MovieSort!], where: MovieWhere): [Movie!]!
                  moviesAggregate(where: MovieWhere): MovieAggregateSelection!
                  moviesConnection(after: String, first: Int, sort: [MovieSort!], where: MovieWhere): MoviesConnection!
                  productions(limit: Int, offset: Int, options: ProductionOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [ProductionSort!], where: ProductionWhere): [Production!]!
                  productionsAggregate(where: ProductionWhere): ProductionAggregateSelection!
                  productionsConnection(after: String, first: Int, sort: [ProductionSort!], where: ProductionWhere): ProductionsConnection!
                  series(limit: Int, offset: Int, options: SeriesOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [SeriesSort!], where: SeriesWhere): [Series!]!
                  seriesAggregate(where: SeriesWhere): SeriesAggregateSelection!
                  seriesConnection(after: String, first: Int, sort: [SeriesSort!], where: SeriesWhere): SeriesConnection!
                }

                type Series implements Production {
                  episodes: Int!
                  title: String!
                }

                type SeriesAggregateSelection {
                  count: Int!
                  episodes: IntAggregateSelection!
                  title: StringAggregateSelection!
                }

                type SeriesConnection {
                  edges: [SeriesEdge!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                input SeriesCreateInput {
                  episodes: Int!
                  title: String!
                }

                type SeriesEdge {
                  cursor: String!
                  node: Series!
                }

                input SeriesOptions {
                  limit: Int
                  offset: Int
                  \\"\\"\\"
                  Specify one or more SeriesSort objects to sort Series by. The sorts will be applied in the order in which they are arranged in the array.
                  \\"\\"\\"
                  sort: [SeriesSort!]
                }

                \\"\\"\\"
                Fields to sort Series by. The order in which sorts are applied is not guaranteed when specifying many fields in one SeriesSort object.
                \\"\\"\\"
                input SeriesSort {
                  episodes: SortDirection
                  title: SortDirection
                }

                input SeriesUpdateInput {
                  episodes: Int
                  episodes_DECREMENT: Int
                  episodes_INCREMENT: Int
                  title: String
                }

                input SeriesWhere {
                  AND: [SeriesWhere!]
                  NOT: SeriesWhere
                  OR: [SeriesWhere!]
                  episodes: Int @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  episodes_EQ: Int
                  episodes_GT: Int
                  episodes_GTE: Int
                  episodes_IN: [Int!]
                  episodes_LT: Int
                  episodes_LTE: Int
                  title: String @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  title_CONTAINS: String
                  title_ENDS_WITH: String
                  title_EQ: String
                  title_IN: [String!]
                  title_STARTS_WITH: String
                }

                \\"\\"\\"An enum for sorting in either ascending or descending order.\\"\\"\\"
                enum SortDirection {
                  \\"\\"\\"Sort by field values in ascending order.\\"\\"\\"
                  ASC
                  \\"\\"\\"Sort by field values in descending order.\\"\\"\\"
                  DESC
                }

                type StringAggregateSelection {
                  longest: String
                  shortest: String
                }

                type UpdateActorsMutationResponse {
                  actors: [Actor!]!
                  info: UpdateInfo!
                }

                \\"\\"\\"
                Information about the number of nodes and relationships created and deleted during an update mutation
                \\"\\"\\"
                type UpdateInfo {
                  nodesCreated: Int!
                  nodesDeleted: Int!
                  relationshipsCreated: Int!
                  relationshipsDeleted: Int!
                }

                type UpdateMoviesMutationResponse {
                  info: UpdateInfo!
                  movies: [Movie!]!
                }

                type UpdateSeriesMutationResponse {
                  info: UpdateInfo!
                  series: [Series!]!
                }"
            `);
        });

        test("Unions", async () => {
            const typeDefs = gql`
                union Search = Movie | Genre

                type Genre @node {
                    id: ID
                }

                type Movie @node {
                    id: ID
                    search: [Search!]! @relationship(type: "SEARCH", direction: OUT)
                    searchNoDirective: Search
                }
            `;
            const neoSchema = new Neo4jGraphQL({
                typeDefs,
                features: {
                    excludeDeprecatedFields: {
                        bookmark: true,
                        arrayFilters: true,
                        stringAggregation: true,
                        aggregationFilters: true,
                    },
                },
            });
            const printedSchema = printSchemaWithDirectives(lexicographicSortSchema(await neoSchema.getSchema()));

            expect(printedSchema).toMatchInlineSnapshot(`
                "schema {
                  query: Query
                  mutation: Mutation
                }

                type CreateGenresMutationResponse {
                  genres: [Genre!]!
                  info: CreateInfo!
                }

                \\"\\"\\"
                Information about the number of nodes and relationships created during a create mutation
                \\"\\"\\"
                type CreateInfo {
                  nodesCreated: Int!
                  relationshipsCreated: Int!
                }

                type CreateMoviesMutationResponse {
                  info: CreateInfo!
                  movies: [Movie!]!
                }

                \\"\\"\\"
                Information about the number of nodes and relationships deleted during a delete mutation
                \\"\\"\\"
                type DeleteInfo {
                  nodesDeleted: Int!
                  relationshipsDeleted: Int!
                }

                type Genre {
                  id: ID
                }

                type GenreAggregateSelection {
                  count: Int!
                  id: IDAggregateSelection!
                }

                input GenreConnectWhere {
                  node: GenreWhere!
                }

                input GenreCreateInput {
                  id: ID
                }

                type GenreEdge {
                  cursor: String!
                  node: Genre!
                }

                input GenreOptions {
                  limit: Int
                  offset: Int
                  \\"\\"\\"
                  Specify one or more GenreSort objects to sort Genres by. The sorts will be applied in the order in which they are arranged in the array.
                  \\"\\"\\"
                  sort: [GenreSort!]
                }

                \\"\\"\\"
                Fields to sort Genres by. The order in which sorts are applied is not guaranteed when specifying many fields in one GenreSort object.
                \\"\\"\\"
                input GenreSort {
                  id: SortDirection
                }

                input GenreUpdateInput {
                  id: ID
                }

                input GenreWhere {
                  AND: [GenreWhere!]
                  NOT: GenreWhere
                  OR: [GenreWhere!]
                  id: ID @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  id_CONTAINS: ID
                  id_ENDS_WITH: ID
                  id_EQ: ID
                  id_IN: [ID]
                  id_STARTS_WITH: ID
                }

                type GenresConnection {
                  edges: [GenreEdge!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                type IDAggregateSelection {
                  longest: ID
                  shortest: ID
                }

                type Movie {
                  id: ID
                  search(directed: Boolean = true, limit: Int, offset: Int, options: QueryOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), where: SearchWhere): [Search!]!
                  searchConnection(after: String, directed: Boolean = true, first: Int, where: MovieSearchConnectionWhere): MovieSearchConnection!
                  searchNoDirective: Search
                }

                type MovieAggregateSelection {
                  count: Int!
                  id: IDAggregateSelection!
                }

                input MovieConnectInput {
                  search: MovieSearchConnectInput
                }

                input MovieConnectWhere {
                  node: MovieWhere!
                }

                input MovieCreateInput {
                  id: ID
                  search: MovieSearchCreateInput
                }

                input MovieDeleteInput {
                  search: MovieSearchDeleteInput
                }

                input MovieDisconnectInput {
                  search: MovieSearchDisconnectInput
                }

                type MovieEdge {
                  cursor: String!
                  node: Movie!
                }

                input MovieOptions {
                  limit: Int
                  offset: Int
                  \\"\\"\\"
                  Specify one or more MovieSort objects to sort Movies by. The sorts will be applied in the order in which they are arranged in the array.
                  \\"\\"\\"
                  sort: [MovieSort!]
                }

                input MovieRelationInput {
                  search: MovieSearchCreateFieldInput
                }

                input MovieSearchConnectInput {
                  Genre: [MovieSearchGenreConnectFieldInput!]
                  Movie: [MovieSearchMovieConnectFieldInput!]
                }

                type MovieSearchConnection {
                  edges: [MovieSearchRelationship!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                input MovieSearchConnectionWhere {
                  Genre: MovieSearchGenreConnectionWhere
                  Movie: MovieSearchMovieConnectionWhere
                }

                input MovieSearchCreateFieldInput {
                  Genre: [MovieSearchGenreCreateFieldInput!]
                  Movie: [MovieSearchMovieCreateFieldInput!]
                }

                input MovieSearchCreateInput {
                  Genre: MovieSearchGenreFieldInput
                  Movie: MovieSearchMovieFieldInput
                }

                input MovieSearchDeleteInput {
                  Genre: [MovieSearchGenreDeleteFieldInput!]
                  Movie: [MovieSearchMovieDeleteFieldInput!]
                }

                input MovieSearchDisconnectInput {
                  Genre: [MovieSearchGenreDisconnectFieldInput!]
                  Movie: [MovieSearchMovieDisconnectFieldInput!]
                }

                input MovieSearchGenreConnectFieldInput {
                  where: GenreConnectWhere
                }

                input MovieSearchGenreConnectionWhere {
                  AND: [MovieSearchGenreConnectionWhere!]
                  NOT: MovieSearchGenreConnectionWhere
                  OR: [MovieSearchGenreConnectionWhere!]
                  node: GenreWhere
                }

                input MovieSearchGenreCreateFieldInput {
                  node: GenreCreateInput!
                }

                input MovieSearchGenreDeleteFieldInput {
                  where: MovieSearchGenreConnectionWhere
                }

                input MovieSearchGenreDisconnectFieldInput {
                  where: MovieSearchGenreConnectionWhere
                }

                input MovieSearchGenreFieldInput {
                  connect: [MovieSearchGenreConnectFieldInput!]
                  create: [MovieSearchGenreCreateFieldInput!]
                }

                input MovieSearchGenreUpdateConnectionInput {
                  node: GenreUpdateInput
                }

                input MovieSearchGenreUpdateFieldInput {
                  connect: [MovieSearchGenreConnectFieldInput!]
                  create: [MovieSearchGenreCreateFieldInput!]
                  delete: [MovieSearchGenreDeleteFieldInput!]
                  disconnect: [MovieSearchGenreDisconnectFieldInput!]
                  update: MovieSearchGenreUpdateConnectionInput
                  where: MovieSearchGenreConnectionWhere
                }

                input MovieSearchMovieConnectFieldInput {
                  connect: [MovieConnectInput!]
                  where: MovieConnectWhere
                }

                input MovieSearchMovieConnectionWhere {
                  AND: [MovieSearchMovieConnectionWhere!]
                  NOT: MovieSearchMovieConnectionWhere
                  OR: [MovieSearchMovieConnectionWhere!]
                  node: MovieWhere
                }

                input MovieSearchMovieCreateFieldInput {
                  node: MovieCreateInput!
                }

                input MovieSearchMovieDeleteFieldInput {
                  delete: MovieDeleteInput
                  where: MovieSearchMovieConnectionWhere
                }

                input MovieSearchMovieDisconnectFieldInput {
                  disconnect: MovieDisconnectInput
                  where: MovieSearchMovieConnectionWhere
                }

                input MovieSearchMovieFieldInput {
                  connect: [MovieSearchMovieConnectFieldInput!]
                  create: [MovieSearchMovieCreateFieldInput!]
                }

                input MovieSearchMovieUpdateConnectionInput {
                  node: MovieUpdateInput
                }

                input MovieSearchMovieUpdateFieldInput {
                  connect: [MovieSearchMovieConnectFieldInput!]
                  create: [MovieSearchMovieCreateFieldInput!]
                  delete: [MovieSearchMovieDeleteFieldInput!]
                  disconnect: [MovieSearchMovieDisconnectFieldInput!]
                  update: MovieSearchMovieUpdateConnectionInput
                  where: MovieSearchMovieConnectionWhere
                }

                type MovieSearchRelationship {
                  cursor: String!
                  node: Search!
                }

                input MovieSearchUpdateInput {
                  Genre: [MovieSearchGenreUpdateFieldInput!]
                  Movie: [MovieSearchMovieUpdateFieldInput!]
                }

                \\"\\"\\"
                Fields to sort Movies by. The order in which sorts are applied is not guaranteed when specifying many fields in one MovieSort object.
                \\"\\"\\"
                input MovieSort {
                  id: SortDirection
                }

                input MovieUpdateInput {
                  id: ID
                  search: MovieSearchUpdateInput
                }

                input MovieWhere {
                  AND: [MovieWhere!]
                  NOT: MovieWhere
                  OR: [MovieWhere!]
                  id: ID @deprecated(reason: \\"Please use the explicit _EQ version\\")
                  id_CONTAINS: ID
                  id_ENDS_WITH: ID
                  id_EQ: ID
                  id_IN: [ID]
                  id_STARTS_WITH: ID
                  \\"\\"\\"
                  Return Movies where all of the related MovieSearchConnections match this filter
                  \\"\\"\\"
                  searchConnection_ALL: MovieSearchConnectionWhere
                  \\"\\"\\"
                  Return Movies where none of the related MovieSearchConnections match this filter
                  \\"\\"\\"
                  searchConnection_NONE: MovieSearchConnectionWhere
                  \\"\\"\\"
                  Return Movies where one of the related MovieSearchConnections match this filter
                  \\"\\"\\"
                  searchConnection_SINGLE: MovieSearchConnectionWhere
                  \\"\\"\\"
                  Return Movies where some of the related MovieSearchConnections match this filter
                  \\"\\"\\"
                  searchConnection_SOME: MovieSearchConnectionWhere
                  \\"\\"\\"Return Movies where all of the related Searches match this filter\\"\\"\\"
                  search_ALL: SearchWhere
                  \\"\\"\\"Return Movies where none of the related Searches match this filter\\"\\"\\"
                  search_NONE: SearchWhere
                  \\"\\"\\"Return Movies where one of the related Searches match this filter\\"\\"\\"
                  search_SINGLE: SearchWhere
                  \\"\\"\\"Return Movies where some of the related Searches match this filter\\"\\"\\"
                  search_SOME: SearchWhere
                }

                type MoviesConnection {
                  edges: [MovieEdge!]!
                  pageInfo: PageInfo!
                  totalCount: Int!
                }

                type Mutation {
                  createGenres(input: [GenreCreateInput!]!): CreateGenresMutationResponse!
                  createMovies(input: [MovieCreateInput!]!): CreateMoviesMutationResponse!
                  deleteGenres(where: GenreWhere): DeleteInfo!
                  deleteMovies(delete: MovieDeleteInput, where: MovieWhere): DeleteInfo!
                  updateGenres(update: GenreUpdateInput, where: GenreWhere): UpdateGenresMutationResponse!
                  updateMovies(connect: MovieConnectInput @deprecated(reason: \\"Top level connect input argument in update is deprecated. Use the nested connect field in the relationship within the update argument\\"), create: MovieRelationInput @deprecated(reason: \\"Top level create input argument in update is deprecated. Use the nested create field in the relationship within the update argument\\"), delete: MovieDeleteInput @deprecated(reason: \\"Top level delete input argument in update is deprecated. Use the nested delete field in the relationship within the update argument\\"), disconnect: MovieDisconnectInput @deprecated(reason: \\"Top level disconnect input argument in update is deprecated. Use the nested disconnect field in the relationship within the update argument\\"), update: MovieUpdateInput, where: MovieWhere): UpdateMoviesMutationResponse!
                }

                \\"\\"\\"Pagination information (Relay)\\"\\"\\"
                type PageInfo {
                  endCursor: String
                  hasNextPage: Boolean!
                  hasPreviousPage: Boolean!
                  startCursor: String
                }

                type Query {
                  genres(limit: Int, offset: Int, options: GenreOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [GenreSort!], where: GenreWhere): [Genre!]!
                  genresAggregate(where: GenreWhere): GenreAggregateSelection!
                  genresConnection(after: String, first: Int, sort: [GenreSort!], where: GenreWhere): GenresConnection!
                  movies(limit: Int, offset: Int, options: MovieOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), sort: [MovieSort!], where: MovieWhere): [Movie!]!
                  moviesAggregate(where: MovieWhere): MovieAggregateSelection!
                  moviesConnection(after: String, first: Int, sort: [MovieSort!], where: MovieWhere): MoviesConnection!
                  searches(limit: Int, offset: Int, options: QueryOptions @deprecated(reason: \\"Query options argument is deprecated, please use pagination arguments like limit, offset and sort instead.\\"), where: SearchWhere): [Search!]!
                }

                \\"\\"\\"Input type for options that can be specified on a query operation.\\"\\"\\"
                input QueryOptions {
                  limit: Int
                  offset: Int
                }

                union Search = Genre | Movie

                input SearchWhere {
                  Genre: GenreWhere
                  Movie: MovieWhere
                }

                \\"\\"\\"An enum for sorting in either ascending or descending order.\\"\\"\\"
                enum SortDirection {
                  \\"\\"\\"Sort by field values in ascending order.\\"\\"\\"
                  ASC
                  \\"\\"\\"Sort by field values in descending order.\\"\\"\\"
                  DESC
                }

                type UpdateGenresMutationResponse {
                  genres: [Genre!]!
                  info: UpdateInfo!
                }

                \\"\\"\\"
                Information about the number of nodes and relationships created and deleted during an update mutation
                \\"\\"\\"
                type UpdateInfo {
                  nodesCreated: Int!
                  nodesDeleted: Int!
                  relationshipsCreated: Int!
                  relationshipsDeleted: Int!
                }

                type UpdateMoviesMutationResponse {
                  info: UpdateInfo!
                  movies: [Movie!]!
                }"
            `);
        });
    });
});
