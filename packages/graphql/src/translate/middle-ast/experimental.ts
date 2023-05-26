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
import type { AttributeNode, NodeNode, Visitor, ProjectionNode, RelationshipNode } from "./ast";
import { NodeKind } from "./ast";
import { MiddleEnvironment } from "./visitors";
import camelcase from "camelcase";
import pluralize from "pluralize";

class Neo4j5ProjectionExp implements Visitor {
    public env: MiddleEnvironment;
    private rootRef: Cypher.Node | undefined;
    private mapProjectionArg: {
        projection: string[];
        extraValues: Record<string, Cypher.Expr>;
    };
    // store the cypher builder references in the format <ASTNode.id, Cypher.Reference>
    private cypherRefMap: Map<string, Cypher.Variable | Cypher.Node | Cypher.Relationship> = new Map();

    constructor(env: MiddleEnvironment) {
        this.env = env;
        this.mapProjectionArg = { projection: [], extraValues: {} };
    }

    Node = {
        enter: (nodeNode: NodeNode) => {
            const parent = this.env.getParent();
            if (parent?.kind === NodeKind.Projection) {
                // rootRef is the old variable "this"
                this.rootRef = new Cypher.Node({ labels: [nodeNode.model.name] });
                this.cypherRefMap.set(nodeNode.id, this.rootRef);
            }
        },
        leave: (nodeNode: NodeNode, nestedResults: []) => {
            // Currently the query is structured with a first match and then nested sub-queries
            const parent = this.env.getParent();
            if (parent?.kind === NodeKind.Projection) {
                return Cypher.concat(new Cypher.Match(this.rootRef as Cypher.Node),  ...nestedResults);
            } else if (parent?.kind === NodeKind.Relationship) {
                // assume that a RelationshipNode has a NodeNode parent
                const sourceNode = this.env.frameStack[1] as NodeNode;
                const relationshipType = (parent as RelationshipNode).model.type;
                const sourceNodeCypherRef = this.cypherRefMap.get(sourceNode.id) as Cypher.Node;
                const relationshipVar = new Cypher.Relationship({type: relationshipType})
                const currentNodeVar = new Cypher.Node({ labels: [nodeNode.model.name] });
                this.cypherRefMap.set(nodeNode.id, currentNodeVar);
                const pattern = new Cypher.Pattern(sourceNodeCypherRef).related(relationshipVar).to(currentNodeVar);
                
                return new Cypher.Call(new Cypher.Match(pattern)).innerWith(sourceNodeCypherRef);
            }
        },
    };

    Relationship = {
        leave: (_, nestedResults: []) => {
            return Cypher.concat(...nestedResults);
        },
    };

    Projection = {
        leave: (_, nestedResults: []) => {
            return { clauses: nestedResults, mapProjectionArg: this.mapProjectionArg, rootRef: this.rootRef };
        },
    };

    Attribute = {
        leave: (attributeNode: AttributeNode) => {
            /**
             * Attribute projections of the top level entity are written differently
             * RETURN this { .name, movies: var2 } AS this
             * instead of
             * WITH this1 { .title } AS this1
             * 
             **/ 
            const parent = this.env.getParent();
            if (this.env.frameStack[1]?.kind === NodeKind.Projection) {
                this.mapProjectionArg.projection.push(attributeNode.model.name);
            } else if (parent?.kind === NodeKind.Node) {
                const nodeNode = parent as NodeNode;
                this.mapProjectionArg.extraValues[pluralize(camelcase(nodeNode.model.name))] = new Cypher.Variable();
            }
            
        },
    };
}

export class Neo4j5RenderExp implements Visitor {
    private projectionRender: Neo4j5ProjectionExp | undefined;
    public env: MiddleEnvironment;

    constructor() {
        this.env = new MiddleEnvironment();
    }
    Projection = {
        enter: () => {
            return true; // stop traversal
        },
        leave: (projectionNode: ProjectionNode) => {
            this.projectionRender = new Neo4j5ProjectionExp(this.env);
            const { clauses, mapProjectionArg, rootRef } = projectionNode.visit(this.projectionRender);
            const matchClause = Cypher.concat(...clauses);

            const { projection, extraValues } = mapProjectionArg;

            const returnClause = new Cypher.Return([
                new Cypher.MapProjection(rootRef, projection, extraValues),
                rootRef,
            ]);
            const cypherProjection = Cypher.concat(matchClause, returnClause);
            return cypherProjection.build();
        },
    };
}
