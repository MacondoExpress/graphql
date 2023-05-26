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

import gql from "graphql-tag";
import { mergeTypeDefs } from "@graphql-tools/merge";
import {
    ProjectionNode,
    NodeNode,
    RelationshipNode,
    AttributeNode,
    FilterNode,
    PrintVisitor,
    Neo4j5Render,
    Neo4j5RenderExp,
} from "./middle-ast";
import { generateModel } from "../../schema-model/generate-model";
import { Neo4jGraphQLSchemaModel } from "../../schema-model/Neo4jGraphQLSchemaModel";
import { ConcreteEntity } from "../../schema-model/entity/ConcreteEntity";
import { Attribute } from "../../schema-model/attribute/Attribute";
import { Relationship } from "../../schema-model/relationship/Relationship";

describe("middle-ast", () => {
    let schemaModel: Neo4jGraphQLSchemaModel;

    beforeAll(() => {
        const typeDefs = gql`
            type Movie {
                title: String
                actors: [Actor!]! @relationship(type: "ACTED_IN", direction: IN)
            }

            type Actor {
                name: String
                anotherName: String
                movies: [Movie!]! @relationship(type: "ACTED_IN", direction: OUT)
            }
        `;

        const document = mergeTypeDefs(typeDefs);
        schemaModel = generateModel(document);
    });

    it("dummy printer", () => {
        const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
        const actor = new NodeNode(actorEntity);
        const movie = new NodeNode(schemaModel.getEntity("Movie") as ConcreteEntity);
        const actorMoviesModel = actorEntity.findRelationship("movies") as Relationship;
        const actedIn = new RelationshipNode(actorMoviesModel);
        actedIn.addNode(movie);
        actor.addRelationship(actedIn);
        actor.addFilter(new FilterNode());

        const projection = new ProjectionNode().addNode(actor);
        const printVisitor = new PrintVisitor();
        expect(projection.visit(printVisitor)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Relationship
            │        ├─ Node
            │     ├─ Filter
            "
        `);
    });

    it("simple projection", () => {
        /** query
         * query Actors {
         *   actors {
         *     name
         *   }
         * }
         **/
        /** expected
         * MATCH (this:`Actor`)
         * RETURN this { .name } AS this
         */
        const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
        const actor = new NodeNode(actorEntity);
        const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
        actor.addAttribute(new AttributeNode(actorAttributeName));
        const projection = new ProjectionNode().addNode(actor);
        const printVisitor = new PrintVisitor();
        expect(projection.visit(printVisitor)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Attribute
            "
        `);
        const neo4j5RenderExp = new Neo4j5RenderExp();
        expect(projection.visit(neo4j5RenderExp)?.cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            RETURN this0 { .name } AS this0"
        `);
    });

    it.only("relationship projection", () => {
        /** query
         * query Actors {
         *   actors {
         *     name
         *     movies {
         *       title
         *     }
         *   }
         * }
         **/
        /** expected
         * MATCH (this:`Actor`)
         * CALL {
         *     WITH this
         *     MATCH (this)-[this0:ACTED_IN]->(this1:`Movie`)
         *     WITH this1 { .title } AS this1
         *     RETURN collect(this1) AS var2
         * }
         * RETURN this { .name, movies: var2 } AS this
         */

        const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
        const movieEntity = schemaModel.getEntity("Movie") as ConcreteEntity;
        const actorMoviesModel = actorEntity.findRelationship("movies") as Relationship;
        const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
        const movieAttributeTitle = movieEntity.findAttribute("title") as Attribute;

        const actor = new NodeNode(actorEntity);
        const actedIn = new RelationshipNode(actorMoviesModel);
        const movie = new NodeNode(movieEntity);

        actor.addRelationship(actedIn);
        actedIn.addNode(movie);
        actor.addAttribute(new AttributeNode(actorAttributeName));
        movie.addAttribute(new AttributeNode(movieAttributeTitle));
        const projection = new ProjectionNode().addNode(actor);
        const printVisitor = new PrintVisitor();
        expect(projection.visit(printVisitor)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Relationship
            │        ├─ Node
            │           ├─ Attribute
            │     ├─ Attribute
            "
        `);
        const neo4j5RenderExp = new Neo4j5RenderExp();
        expect(projection.visit(neo4j5RenderExp)?.cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            CALL {
                WITH this0
                MATCH (this0:\`Actor\`)-[this1:ACTED_IN]->(this2:\`Movie\`)
            }
            RETURN this0 { .name, movies: var3 } AS this0"
        `);
    });
});
