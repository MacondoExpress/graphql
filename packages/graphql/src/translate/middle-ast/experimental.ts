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
import type {
    AttributeNode,
    NodeNode,
    Visitor,
    ProjectionNode,
    RelationshipNode,
    FilterNode,
    EQNode,
    GTNode,
    LTNode,
    ANDNode,
    ORNode,
    EnterLeaveVisit,
} from "./ast";
import { NodeKind } from "./ast";
import { MiddleEnvironment } from "./visitors";
import camelcase from "camelcase";
import pluralize from "pluralize";

class PatternFilter implements Visitor {
    public env: MiddleEnvironment;
    public source: Cypher.Node;
    public relationship: Cypher.Relationship | undefined;
    public target: Cypher.Node | undefined;
    private predicate: Cypher.Predicate | undefined;

    constructor(env: MiddleEnvironment, source: Cypher.Node, relationship?: Cypher.Relationship, target?: Cypher.Node) {
        this.env = env;
        this.source = source;
        this.relationship = relationship;
        this.target = target;
    }

    EQ: EnterLeaveVisit<EQNode> = {
        leave: (eqNode: EQNode) => {
            const { left, right } = eqNode;
            const { name } = left.model;
            const { value } = right;
            const predicate = Cypher.eq(this.source.property(name), new Cypher.Param(value));
            this.predicate = predicate;
            return this.predicate;
        },
    };

    GT: EnterLeaveVisit<GTNode> = {
        leave: (gtNode: GTNode) => {
            const { left, right } = gtNode;
            const { name } = left.model;
            const { value } = right;
            const predicate = Cypher.gt(this.source.property(name), new Cypher.Param(value));
            this.predicate = predicate;
            return this.predicate;
        },
    };

    LT: EnterLeaveVisit<LTNode> = {
        leave: (ltNode: LTNode) => {
            const { left, right } = ltNode;
            const { name } = left.model;
            const { value } = right;
            const predicate = Cypher.lt(this.source.property(name), new Cypher.Param(value));
            this.predicate = predicate;
            return this.predicate;
        },
    };

    AND: EnterLeaveVisit<ANDNode> = {
        leave: (andNode: ANDNode) => {
            const nestedPredicates = andNode.children.map((child) => {
                return child.visit(this);
            });

            this.predicate = Cypher.and(...nestedPredicates);
            return this.predicate;
        },
    };

    OR: EnterLeaveVisit<ORNode> = {
        leave: (orNode: ORNode) => {
            const nestedPredicates = orNode.children.map((child) => {
                return child.visit(this);
            });

            this.predicate = Cypher.or(...nestedPredicates);
            return this.predicate;
        },
    };
}

// Generates nested projection using subqueries
class SubQueryProjection implements Visitor {
    public env: MiddleEnvironment;
    private parentRef: Cypher.Node;
    private subQuery: Cypher.Call | undefined;
    private projectionArgument: [string, Cypher.Variable] | undefined;

    constructor(env: MiddleEnvironment, parentRef: Cypher.Node) {
        this.env = env;
        this.parentRef = parentRef;
    }
    // At this moment the only top level query supported are of type NodeNode, with 1st class citizen Relationship and Abstract types parity this may change
    Relationship = {
        leave: (relationshipNode: RelationshipNode) => {
            const targetNode = relationshipNode.children.find((child) => child.kind === NodeKind.Node) as
                | NodeNode
                | undefined; // Move this to some utility function

            if (!targetNode) {
                throw new Error("Relationship node must have a target node");
            }

            const relationship = new Cypher.Relationship({ type: relationshipNode.model.type });
            const relationshipFilterNode = relationshipNode.children.find((child) => child.kind === NodeKind.Filter); // move this to some utility function;
            const nodeFilterNode = targetNode.children.find((child) => child.kind === NodeKind.Filter); // move this to some utility function;
            const targetNodeRef = new Cypher.Node({ labels: [targetNode.model.name] });
            const cypherMatch = new Cypher.Match(
                new Cypher.Pattern(this.parentRef).related(relationship).to(targetNodeRef)
            );

         /*    if (relationshipFilterNode || nodeFilterNode) {
                if (relationshipFilterNode) {
                    const relationshipPatternFilter = new PatternFilter(
                        this.env,
                        this.parentRef,
                        relationship,
                        targetNodeRef
                    );
                    relationshipFilterNode.children.map((child) => {
                        child.visit(relationshipPatternFilter);
                    });
                    cypherMatch.where(relationshipPatternFilter.build());
                }
                if (nodeFilterNode) {
                    const nodePatternFilter = new PatternFilter(this.env, this.parentRef, relationship, targetNodeRef);
                    nodeFilterNode.children.forEach((child) => {
                        child.visit(nodePatternFilter);
                    });
                    relationshipFilterNode
                        ? cypherMatch.and(nodePatternFilter.build())
                        : cypherMatch.where(nodePatternFilter.build());
                }
            } */
            // TODO: reused logic for projection, when the AST design is more stable move to utility function
            const targetNodeAttributes = (
                targetNode.children.filter((child) => child.kind === NodeKind.Attribute) as AttributeNode[]
            ).map((attributeNode: AttributeNode) => {
                return attributeNode.model.name;
            });
            const targetNodeAttributeProjection = new Cypher.MapProjection(targetNodeRef, targetNodeAttributes);
            cypherMatch.with([targetNodeAttributeProjection, targetNodeRef]);
            this.projectionArgument = [pluralize(camelcase(targetNode.model.name)), new Cypher.Variable()];
            cypherMatch.return([Cypher.collect(targetNodeRef), this.projectionArgument[1]]);
            this.subQuery = new Cypher.Call(cypherMatch).innerWith(this.parentRef);
        },
    };

    build(): [Cypher.Clause, [string, Cypher.Variable]] {
        if (!this.subQuery || !this.projectionArgument) {
            throw new Error("Subquery not built");
        }
        return [this.subQuery, this.projectionArgument];
    }
}

// Currently the query is structured with a first match and then nested sub-queries, this is the reason why we have two Visitors.
class RootProjection implements Visitor {
    public env: MiddleEnvironment;
    private clause: Cypher.Clause | undefined;

    constructor(env: MiddleEnvironment) {
        this.env = env;
    }

    // At this moment the only top level query supported are of type NodeNode, with 1st class citizen Relationship and Abstract types parity this may change
    Node = {
        leave: (nodeNode: NodeNode) => {
            const root = new Cypher.Node({ labels: [nodeNode.model.name] });
            const subqueryClauses: Cypher.Clause[] = [];
            const subqueryReturnedVariables: Record<string, Cypher.Variable> = {};
            for (const child of nodeNode.children) {
                if (child.kind === NodeKind.Relationship) {
                    const subqueryProjection = new SubQueryProjection(this.env, root);
                    child.visit(subqueryProjection);
                    const [subquery, projectionVariable] = subqueryProjection.build();
                    subqueryClauses.push(subquery);
                    subqueryReturnedVariables[projectionVariable[0]] = projectionVariable[1];
                }
            }

            // TODO: reused logic for projection, when the AST design is more stable move to utility function
            const attributes = (
                nodeNode.children.filter((child) => child.kind === NodeKind.Attribute) as AttributeNode[]
            ).map((attributeNode: AttributeNode) => {
                return attributeNode.model.name;
            });
            const rootMatch = new Cypher.Match(root);
            const filterNode = nodeNode.children.find((child) => child.kind === NodeKind.Filter) as
                | FilterNode
                | undefined;
            if (filterNode) {
                const patternFilter = new PatternFilter(this.env, root);
                const predicates = filterNode.children.map((child) => {
                    return child.visit(patternFilter) as Cypher.Predicate;
                });
                this.clause = predicates.length > 1 ? rootMatch.where(Cypher.and(...predicates)) : rootMatch.where(predicates[0] as Cypher.Predicate);
            }
            const returnClause = new Cypher.MapProjection(root, attributes, subqueryReturnedVariables);
            this.clause = Cypher.concat(rootMatch, ...subqueryClauses, new Cypher.Return([returnClause, root]));
        },
    };

    build(): Cypher.Clause {
        if (!this.clause) {
            throw new Error("Clause not built");
        }
        return this.clause;
    }
}

export class Neo4j5Render implements Visitor {
    public env: MiddleEnvironment;
    private clause: Cypher.Clause | undefined;

    constructor() {
        this.env = new MiddleEnvironment();
    }
    Projection = {
        leave: (projectionNode: ProjectionNode) => {
            const nodeNode = projectionNode.children.find((child) => child.kind === NodeKind.Node) as
                | NodeNode
                | undefined; // Move this to some utility function
            const rootProjection = new RootProjection(this.env);
            if (nodeNode) {
                nodeNode.visit(rootProjection);
            }
            this.clause = rootProjection.build();
        },
    };
    build(): Cypher.Clause {
        if (!this.clause) {
            throw new Error("Clause not built");
        }
        return this.clause;
    }
}
