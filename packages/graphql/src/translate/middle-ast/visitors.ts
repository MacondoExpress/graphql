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


import Cypher from "@neo4j/cypher-builder";
import type { AttributeNode, NodeNode, Visitor, ProjectionNode, ASTNode, Environment } from "./ast";

export const noop = () => false;

export class MiddleEnvironment implements Environment {
    public frameStack: ASTNode[] = [];
    private cypherBuilder: Cypher.Clause | undefined;
    setCypherBuilder(clause: Cypher.Clause) {
        if (this.cypherBuilder) {
            this.cypherBuilder = Cypher.concat(this.cypherBuilder, clause);
        } else {
            this.cypherBuilder = clause;
        }
    }
    getCypherBuilder(): Cypher.Clause | undefined {
        return this.cypherBuilder;
    }
    
    getParent() {
        return this.frameStack[0];
    }
}

export class Neo4j5Projection implements Visitor {
    public env: MiddleEnvironment;
    public topLevelRef: Cypher.Node | undefined;
    public mapProjectionArg: {
        projection: string[];
        extraValues: Record<string, Cypher.Expr>;
    };
    private firstNode = true;
    private currentRef: Cypher.Node | undefined;

    constructor(env: MiddleEnvironment) {
        this.env = env;
        this.mapProjectionArg = { projection: [], extraValues: {} };
    }

    Node = {
        enter: (nodeNode: NodeNode) => {
            // Currently the query is structured as a first match and then nested sub-queries
            if (this.firstNode) {
                this.firstNode = false;
                // topLevelRef is the old variable "this"
                this.topLevelRef = new Cypher.Node({ labels: [nodeNode.model.name] });
                const match = new Cypher.Match(this.topLevelRef);
                this.env.setCypherBuilder(match);
            } else {
                console.log("step");
            }
        },
        leave: noop,
    };

    Attribute = {
        enter: noop,
        leave: (attributeNode: AttributeNode) => {
            this.mapProjectionArg.projection.push(attributeNode.model.name);
        },
    };
}

export class Neo4j5Render implements Visitor {
    private projectionRender: Neo4j5Projection;
    public env: MiddleEnvironment;

    constructor() {
        this.env = new MiddleEnvironment();
        this.projectionRender = new Neo4j5Projection(this.env);
    }
    Projection = {
        enter: (projectionNode: ProjectionNode) => {
            projectionNode.visit(this.projectionRender);
            return true; // stop traversal
        },
        leave: () => {
            const topLevelRef = this.projectionRender?.topLevelRef as Cypher.Node;
            const { projection, extraValues } = this.projectionRender.mapProjectionArg;
            const cbReturn = new Cypher.Return([
                new Cypher.MapProjection(topLevelRef, projection, extraValues),
                topLevelRef,
            ]);
            this.env.setCypherBuilder(cbReturn);
        },
    };

    render(): Cypher.CypherResult | undefined {
        return this.env.getCypherBuilder()?.build();
    }
}
