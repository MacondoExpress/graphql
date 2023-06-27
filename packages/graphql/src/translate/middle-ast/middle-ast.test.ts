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
    EQNode,
    LiteralValueNode,
    GTNode,
    ANDNode,
    ORNode,
} from "./middle-ast";
import { generateModel } from "../../schema-model/generate-model";
import type { Neo4jGraphQLSchemaModel } from "../../schema-model/Neo4jGraphQLSchemaModel";
import type { ConcreteEntity } from "../../schema-model/entity/ConcreteEntity";
import type { Attribute } from "../../schema-model/attribute/Attribute";
import type { Relationship } from "../../schema-model/relationship/Relationship";

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
                partner: Person @relationship(type: "MARRIED", direction: OUT)
            }

            type Person { 
                name: String
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
        expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Relationship
            │        ├─ Node
            │     ├─ Filter
            "
        `);
    });

    it("projection", () => {
        /** query
         * query Actors {
         *   actors {
         *     name
         *     anotherName
         *   }
         * }
         **/
        /** expected
         * MATCH (this:`Actor`)
         * RETURN this { .name, .anotherName } AS this
         */
        const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
        const actor = new NodeNode(actorEntity);
        const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
        const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
        actor.addAttribute(new AttributeNode(actorAttributeName));
        actor.addAttribute(new AttributeNode(actorAttributeAnotherName));
        const projection = new ProjectionNode().addNode(actor);
        const printVisitor = new PrintVisitor();
        expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Attribute
            │     ├─ Attribute
            "
        `);
        const neo4j5Render = new Neo4j5Render();
        projection.visit(neo4j5Render);
        const clause = neo4j5Render.build();
        const { cypher, params } = clause.build();
        expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            RETURN this0 { .name, .anotherName } AS this0"
        `);
        expect(params).toStrictEqual({});
    });

    it("relationship projection", () => {
        /** query
         * query Actors {
         *   actors {
         *     name
         *     anotherName
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
         * RETURN this { .name, .anotherName, movies: var2 } AS this
         */

        const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
        const movieEntity = schemaModel.getEntity("Movie") as ConcreteEntity;
        const actorMoviesModel = actorEntity.findRelationship("movies") as Relationship;
        const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
        const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
        const movieAttributeTitle = movieEntity.findAttribute("title") as Attribute;

        const actor = new NodeNode(actorEntity);
        const actedIn = new RelationshipNode(actorMoviesModel);
        const movie = new NodeNode(movieEntity);

        actor.addRelationship(actedIn);
        actedIn.addNode(movie);
        actor.addAttribute(new AttributeNode(actorAttributeName));
        actor.addAttribute(new AttributeNode(actorAttributeAnotherName));
        movie.addAttribute(new AttributeNode(movieAttributeTitle));

        const projection = new ProjectionNode().addNode(actor);
        const printVisitor = new PrintVisitor();
        expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Relationship
            │        ├─ Node
            │           ├─ Attribute
            │     ├─ Attribute
            │     ├─ Attribute
            "
        `);
        const neo4j5Render = new Neo4j5Render();
        projection.visit(neo4j5Render);
        const clause = neo4j5Render.build();
        const { cypher, params } = clause.build();
        expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            CALL {
                WITH this0
                MATCH (this0:\`Actor\`)-[this1:ACTED_IN]->(this2:\`Movie\`)
                WITH this2 { .title } AS this2
                RETURN collect(this2) AS var3
            }
            RETURN this0 { .name, .anotherName, movies: var3 } AS this0"
        `);
        expect(params).toStrictEqual({});
    });

    it.skip("relationship projection with more than one relationships", () => {
        /** query
         * query Actors {
         *   actors {
         *     name
         *     anotherName
         *     partner {
         *      name
         *     }
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
         * RETURN this { .name, .anotherName, movies: var2 } AS this
         */

        const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
        const movieEntity = schemaModel.getEntity("Movie") as ConcreteEntity;
        const actorMoviesModel = actorEntity.findRelationship("movies") as Relationship;
        const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
        const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
        const movieAttributeTitle = movieEntity.findAttribute("title") as Attribute;

        const actor = new NodeNode(actorEntity);
        const actedIn = new RelationshipNode(actorMoviesModel);
        const movie = new NodeNode(movieEntity);

        actor.addRelationship(actedIn);
        actedIn.addNode(movie);
        actor.addAttribute(new AttributeNode(actorAttributeName));
        actor.addAttribute(new AttributeNode(actorAttributeAnotherName));
        movie.addAttribute(new AttributeNode(movieAttributeTitle));

        const projection = new ProjectionNode().addNode(actor);
        const printVisitor = new PrintVisitor();
        expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Relationship
            │        ├─ Node
            │           ├─ Attribute
            │     ├─ Attribute
            │     ├─ Attribute
            "
        `);
        const neo4j5Render = new Neo4j5Render();
        projection.visit(neo4j5Render);
        const clause = neo4j5Render.build();
        const { cypher, params } = clause.build();
        expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            CALL {
                WITH this0
                MATCH (this0:\`Actor\`)-[this1:ACTED_IN]->(this2:\`Movie\`)
                WITH this2 { .title } AS this2
                RETURN collect(this2) AS var3
            }
            RETURN this0 { .name, .anotherName, movies: var3 } AS this0"
        `);
        expect(params).toStrictEqual({});
    });

    describe("filters", () => {
        describe("on TOP level", () => {
            it("projection with filters, EQ", () => {
                /** query {
                 * actors(where: { name: "Stuff" }) {
                 *   name
                 *   anotherName
                 * }
                 **/
                /** expected
                 * MATCH (this:`Actor`)
                 * WHERE this.name = "Stuff"
                 * RETURN this { .name, .anotherName } AS this
                 */
                const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
                const actor = new NodeNode(actorEntity);
                const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
                const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
                const actorName = new AttributeNode(actorAttributeName);
                actor.addAttribute(actorName);
                actor.addAttribute(new AttributeNode(actorAttributeAnotherName));
                const actorFilter = new FilterNode().addChildren(new EQNode(actorName, new LiteralValueNode("Stuff")));
                actor.addFilter(actorFilter);
                const projection = new ProjectionNode().addNode(actor);
                const printVisitor = new PrintVisitor();
                expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Attribute
            │     ├─ Attribute
            │     ├─ Filter
            │        ├─ EQ
            │           ├─ Attribute
            │           ├─ LiteralValue
            "
        `);
                const neo4j5Render = new Neo4j5Render();
                projection.visit(neo4j5Render);
                const clause = neo4j5Render.build();
                const { cypher, params } = clause.build();
                expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            WHERE this0.name = $param0
            RETURN this0 { .name, .anotherName } AS this0"
        `);
                expect(params).toStrictEqual({
                    param0: "Stuff",
                });
            });

            it("projection with filters, GT", () => {
                /** query {
                 * actors(where: { name_GT: "Stuff" }) {
                 *   name
                 *   anotherName
                 * }
                 **/
                /** expected
                 * MATCH (this:`Actor`)
                 * WHERE this.name > "Stuff"
                 * RETURN this { .name, .anotherName } AS this
                 */
                const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
                const actor = new NodeNode(actorEntity);
                const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
                const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
                const actorName = new AttributeNode(actorAttributeName);
                actor.addAttribute(actorName);
                actor.addAttribute(new AttributeNode(actorAttributeAnotherName));
                const actorFilter = new FilterNode().addChildren(new GTNode(actorName, new LiteralValueNode("Stuff")));
                actor.addFilter(actorFilter);
                const projection = new ProjectionNode().addNode(actor);
                const printVisitor = new PrintVisitor();
                expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Attribute
            │     ├─ Attribute
            │     ├─ Filter
            │        ├─ GT
            │           ├─ Attribute
            │           ├─ LiteralValue
            "
        `);
                const neo4j5Render = new Neo4j5Render();
                projection.visit(neo4j5Render);
                const clause = neo4j5Render.build();
                const { cypher, params } = clause.build();
                expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            WHERE this0.name > $param0
            RETURN this0 { .name, .anotherName } AS this0"
        `);
                expect(params).toStrictEqual({
                    param0: "Stuff",
                });
            });

            it("projection with filters, AND", () => {
                /** query {
                 * actors(where: { AND: [ { name: "Stuff" }, { anotherName: "AnotherStuff" } ] }) {
                 *   name
                 *   anotherName
                 * }
                 **/
                /** expected
                 * MATCH (this:`Actor`)
                 * WHERE this.name = "Stuff" AND this.anotherName = "AnotherStuff"
                 * RETURN this { .name, .anotherName } AS this
                 */
                const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
                const actor = new NodeNode(actorEntity);
                const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
                const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
                const actorName = new AttributeNode(actorAttributeName);
                const anotherName = new AttributeNode(actorAttributeAnotherName);
                actor.addAttribute(actorName);
                actor.addAttribute(anotherName);
                const actorFilter = new FilterNode().addChildren(
                    new ANDNode()
                        .addChildren(new EQNode(actorName, new LiteralValueNode("Stuff")))
                        .addChildren(new EQNode(anotherName, new LiteralValueNode("AnotherStuff")))
                );
                actor.addFilter(actorFilter);
                const projection = new ProjectionNode().addNode(actor);
                const printVisitor = new PrintVisitor();
                expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Attribute
            │     ├─ Attribute
            │     ├─ Filter
            │        ├─ AND
            │           ├─ EQ
            │              ├─ Attribute
            │              ├─ LiteralValue
            │           ├─ EQ
            │              ├─ Attribute
            │              ├─ LiteralValue
            "
        `);
                const neo4j5Render = new Neo4j5Render();
                projection.visit(neo4j5Render);
                const clause = neo4j5Render.build();
                const { cypher, params } = clause.build();
                expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            WHERE (this0.name = $param0 AND this0.anotherName = $param1)
            RETURN this0 { .name, .anotherName } AS this0"
        `);
                expect(params).toStrictEqual({
                    param0: "Stuff",
                    param1: "AnotherStuff",
                });
            });

            it("projection with filters, OR", () => {
                /** query {
                 * actors(where: { OR: [ { name: "Stuff" }, { anotherName: "AnotherStuff" } ] }) {
                 *   name
                 *   anotherName
                 * }
                 **/
                /** expected
                 * MATCH (this:`Actor`)
                 * WHERE this.name = "Stuff" OR this.anotherName = "AnotherStuff"
                 * RETURN this { .name, .anotherName } AS this
                 */
                const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
                const actor = new NodeNode(actorEntity);
                const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
                const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
                const actorName = new AttributeNode(actorAttributeName);
                const anotherName = new AttributeNode(actorAttributeAnotherName);
                actor.addAttribute(actorName);
                actor.addAttribute(anotherName);
                const actorFilter = new FilterNode().addChildren(
                    new ORNode()
                        .addChildren(new EQNode(actorName, new LiteralValueNode("Stuff")))
                        .addChildren(new EQNode(anotherName, new LiteralValueNode("AnotherStuff")))
                );
                actor.addFilter(actorFilter);
                const projection = new ProjectionNode().addNode(actor);
                const printVisitor = new PrintVisitor();
                expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Attribute
            │     ├─ Attribute
            │     ├─ Filter
            │        ├─ OR
            │           ├─ EQ
            │              ├─ Attribute
            │              ├─ LiteralValue
            │           ├─ EQ
            │              ├─ Attribute
            │              ├─ LiteralValue
            "
        `);
                const neo4j5Render = new Neo4j5Render();
                projection.visit(neo4j5Render);
                const clause = neo4j5Render.build();
                const { cypher, params } = clause.build();
                expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            WHERE (this0.name = $param0 OR this0.anotherName = $param1)
            RETURN this0 { .name, .anotherName } AS this0"
        `);
                expect(params).toStrictEqual({
                    param0: "Stuff",
                    param1: "AnotherStuff",
                });
            });

            it("projection with filters, Complex filter", () => {
                /** query {
                 * actors(where: { OR: [ { name: "Stuff" }, AND: [ { name: "realStuff" }, { anotherName: "AnotherStuff" } ] ] }) {
                 *   name
                 *   anotherName
                 * }
                 **/
                /** expected
                 * MATCH (this:`Actor`)
                 * WHERE this.name = "Stuff" OR (this.name = "realStuff" AND this.anotherName = "AnotherStuff")
                 * RETURN this { .name, .anotherName } AS this
                 */
                const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
                const actor = new NodeNode(actorEntity);
                const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
                const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
                const actorName = new AttributeNode(actorAttributeName);
                const anotherName = new AttributeNode(actorAttributeAnotherName);
                actor.addAttribute(actorName);
                actor.addAttribute(anotherName);
                const actorFilter = new FilterNode().addChildren(
                    new ORNode()
                        .addChildren(new EQNode(actorName, new LiteralValueNode("Stuff")))
                        .addChildren(
                            new ANDNode()
                                .addChildren(new EQNode(actorName, new LiteralValueNode("realStuff")))
                                .addChildren(new EQNode(anotherName, new LiteralValueNode("AnotherStuff")))
                        )
                );
                actor.addFilter(actorFilter);
                const projection = new ProjectionNode().addNode(actor);
                const printVisitor = new PrintVisitor();
                expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Attribute
            │     ├─ Attribute
            │     ├─ Filter
            │        ├─ OR
            │           ├─ EQ
            │              ├─ Attribute
            │              ├─ LiteralValue
            │           ├─ AND
            │              ├─ EQ
            │                 ├─ Attribute
            │                 ├─ LiteralValue
            │              ├─ EQ
            │                 ├─ Attribute
            │                 ├─ LiteralValue
            "
        `);
                const neo4j5Render = new Neo4j5Render();
                projection.visit(neo4j5Render);
                const clause = neo4j5Render.build();
                const { cypher, params } = clause.build();
                expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            WHERE (this0.name = $param0 OR (this0.name = $param1 AND this0.anotherName = $param2))
            RETURN this0 { .name, .anotherName } AS this0"
        `);
                expect(params).toStrictEqual({
                    param0: "Stuff",
                    param1: "realStuff",
                    param2: "AnotherStuff",
                });
            });

            it("projection with filters, Complex filter (deeply nested)", () => {
                /** query {
                 * actors(where: { OR: [ { name: "Stuff" }, AND: [ { name: "realStuff" }, OR: [ {name: "someValue"}, { anotherName: "AnotherStuff" } ] ] ] }) {
                 *   name
                 *   anotherName
                 * }
                 **/
                /** expected
                 * MATCH (this:`Actor`)
                 * WHERE this.name = "Stuff" OR (this.name = "realStuff" AND ( this.name = "someValue" OR this.anotherName = "AnotherStuff") )
                 * RETURN this { .name, .anotherName } AS this
                 */
                const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
                const actor = new NodeNode(actorEntity);
                const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
                const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
                const actorName = new AttributeNode(actorAttributeName);
                const anotherName = new AttributeNode(actorAttributeAnotherName);
                actor.addAttribute(actorName);
                actor.addAttribute(anotherName);
                const actorFilter = new FilterNode().addChildren(
                    new ORNode()
                        .addChildren(new EQNode(actorName, new LiteralValueNode("Stuff")))
                        .addChildren(
                            new ANDNode()
                                .addChildren(new EQNode(actorName, new LiteralValueNode("realStuff")))
                                .addChildren(
                                    new ORNode()
                                        .addChildren(new EQNode(actorName, new LiteralValueNode("someValue")))
                                        .addChildren(new EQNode(anotherName, new LiteralValueNode("AnotherStuff")))
                                )
                        )
                );
                actor.addFilter(actorFilter);
                const projection = new ProjectionNode().addNode(actor);
                const printVisitor = new PrintVisitor();
                expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Attribute
            │     ├─ Attribute
            │     ├─ Filter
            │        ├─ OR
            │           ├─ EQ
            │              ├─ Attribute
            │              ├─ LiteralValue
            │           ├─ AND
            │              ├─ EQ
            │                 ├─ Attribute
            │                 ├─ LiteralValue
            │              ├─ OR
            │                 ├─ EQ
            │                    ├─ Attribute
            │                    ├─ LiteralValue
            │                 ├─ EQ
            │                    ├─ Attribute
            │                    ├─ LiteralValue
            "
        `);
                const neo4j5Render = new Neo4j5Render();
                projection.visit(neo4j5Render);
                const clause = neo4j5Render.build();
                const { cypher, params } = clause.build();
                expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            WHERE (this0.name = $param0 OR (this0.name = $param1 AND (this0.name = $param2 OR this0.anotherName = $param3)))
            RETURN this0 { .name, .anotherName } AS this0"
        `);
                expect(params).toStrictEqual({
                    param0: "Stuff",
                    param1: "realStuff",
                    param2: "someValue",
                    param3: "AnotherStuff",
                });
            });
        });
        describe("on nested levels", () => {
            it("projection with filters, EQ", () => {
                /** query {
                 * actors(where: { name: "Stuff" }) {
                 *   name
                 *   anotherName
                 * }
                 **/
                /** expected
                 * MATCH (this:`Actor`)
                 * WHERE this.name = "Stuff"
                 * RETURN this { .name, .anotherName } AS this
                 */
                const actorEntity = schemaModel.getEntity("Actor") as ConcreteEntity;
                const actor = new NodeNode(actorEntity);
                const actorAttributeName = actorEntity.findAttribute("name") as Attribute;
                const actorAttributeAnotherName = actorEntity.findAttribute("anotherName") as Attribute;
                const actorName = new AttributeNode(actorAttributeName);
                actor.addAttribute(actorName);
                actor.addAttribute(new AttributeNode(actorAttributeAnotherName));
                const actorFilter = new FilterNode().addChildren(new EQNode(actorName, new LiteralValueNode("Stuff")));
                actor.addFilter(actorFilter);
                const projection = new ProjectionNode().addNode(actor);
                const printVisitor = new PrintVisitor();
                expect(projection.visit(printVisitor, true)).toMatchInlineSnapshot(`
            "Projection
            │  ├─ Node
            │     ├─ Attribute
            │     ├─ Attribute
            │     ├─ Filter
            │        ├─ EQ
            │           ├─ Attribute
            │           ├─ LiteralValue
            "
        `);
                const neo4j5Render = new Neo4j5Render();
                projection.visit(neo4j5Render);
                const clause = neo4j5Render.build();
                const { cypher, params } = clause.build();
                expect(cypher).toMatchInlineSnapshot(`
            "MATCH (this0:\`Actor\`)
            WHERE this0.name = $param0
            RETURN this0 { .name, .anotherName } AS this0"
        `);
                expect(params).toStrictEqual({
                    param0: "Stuff",
                });
            });

        });
    });
});
