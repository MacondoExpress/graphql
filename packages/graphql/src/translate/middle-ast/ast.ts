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

import type { ConcreteEntity } from "../../schema-model/entity/ConcreteEntity";
import type { Attribute, AttributeType } from "../../schema-model/attribute/Attribute";
import type { Relationship } from "../../schema-model/relationship/Relationship";
import { v4 as uuidv4 } from "uuid";

export abstract class ASTNode {
    public id = uuidv4();
    public kind = "ASTNode";
    public children: ASTNode[] = [];

    protected addChildren(node: ASTNode): void {
        this.children.push(node);
    }

    public visit(visitor: Visitor, traverse = false): any {
        const stopFlag = visitor[this.kind]?.enter && visitor[this.kind]?.enter(this);
        visitor.env?.frameStack?.unshift(this);
        let nestedResults: any[] = [];
        if (!stopFlag && traverse) {
            nestedResults = this.traverse(this, visitor);
        }
        visitor.env?.frameStack?.shift();
        return visitor[this.kind]?.leave && visitor[this.kind]?.leave(this, nestedResults);
    }

    protected traverse(node: ASTNode, visitor: Visitor): any {
        return this.dfsTraverse(node, visitor);
    }

    protected dfsTraverse(node: ASTNode, visitor: Visitor): any {
        return node.children.map((child) => child.visit(visitor, true));
    }
}

export enum NodeKind {
    Node = "Node",
    Relationship = "Relationship",
    Attribute = "Attribute",
    Projection = "Projection",
    Filter = "Filter",
    LiteralValue = "LiteralValue",
    EQ = "EQ",
    NEQ = "NEQ",
    GT = "GT",
    LT = "LT",
    AND = "AND",
    OR = "OR",
    NOT = "NOT",
}

export type EnterLeaveVisit<T = ASTNode> = {
    enter?: (ASTNode: T) => boolean | void;
    leave?: (ASTNode: T, nestedResults: []) => any;
};

export interface CompleteVisitor {
    Node: EnterLeaveVisit<NodeNode>;
    Relationship: EnterLeaveVisit<RelationshipNode>;
    Attribute: EnterLeaveVisit<AttributeNode>;
    Projection: EnterLeaveVisit<ProjectionNode>;
    Filter: EnterLeaveVisit<FilterNode>;
    LiteralValue: EnterLeaveVisit<LiteralValueNode>;
    EQ: EnterLeaveVisit<EQNode>;
    NEQ: EnterLeaveVisit<NEQNode>;
    GT: EnterLeaveVisit<GTNode>;
    LT: EnterLeaveVisit<LTNode>;
    OR: EnterLeaveVisit<ORNode>;
    AND: EnterLeaveVisit<ANDNode>;
    NOT: EnterLeaveVisit<ANDNode>;
    env: Environment;
}

export interface Environment {
    frameStack: ASTNode[];
}

export type Visitor = Partial<CompleteVisitor>;

export class NodeNode extends ASTNode {
    public kind = NodeKind.Node;
    public model: ConcreteEntity;

    constructor(model: ConcreteEntity) {
        super();
        this.model = model;
    }

    addRelationship(relationship: RelationshipNode) {
        super.addChildren(relationship);
        return this;
    }

    addAttribute(attribute: AttributeNode) {
        super.addChildren(attribute);
        return this;
    }

    addFilter(filter: FilterNode) {
        super.addChildren(filter);
        return this;
    }
}

export class RelationshipNode extends ASTNode {
    public kind = NodeKind.Relationship;
    public model: Relationship;
    constructor(model: Relationship) {
        super();
        this.model = model;
    }

    addNode(node: NodeNode) {
        super.addChildren(node);
        return this;
    }
}

export class AttributeNode extends ASTNode {
    public kind = NodeKind.Attribute;
    public model: Attribute;

    constructor(attribute: Attribute) {
        super();
        this.model = attribute;
    }
}
export class FilterNode extends ASTNode {
    public kind = NodeKind.Filter;

    // I guess we concatenate the filters children with AND
    public addChildren(node: ASTNode): FilterNode {
        super.addChildren(node);
        return this;
    }
}

export class EQNode extends ASTNode {
    public kind = NodeKind.EQ;
    public left: AttributeNode;
    public right: LiteralValueNode;

    constructor(left: AttributeNode, right: LiteralValueNode) {
        super();
        super.addChildren(left);
        super.addChildren(right);
        this.left = left;
        this.right = right;
    }
}

export class NEQNode extends ASTNode {
    public kind = NodeKind.NEQ;
    public left: AttributeNode;
    public right: LiteralValueNode;

    constructor(left: AttributeNode, right: LiteralValueNode) {
        super();
        super.addChildren(left);
        super.addChildren(right);
        this.left = left;
        this.right = right;
    }
}

export class GTNode extends ASTNode {
    public kind = NodeKind.GT;
    public left: AttributeNode;
    public right: LiteralValueNode;

    constructor(left: AttributeNode, right: LiteralValueNode) {
        super();
        super.addChildren(left);
        super.addChildren(right);
        this.left = left;
        this.right = right;
    }
}

export class LTNode extends ASTNode {
    public kind = NodeKind.GT;
    public left: AttributeNode;
    public right: LiteralValueNode;

    constructor(left: AttributeNode, right: LiteralValueNode) {
        super();
        super.addChildren(left);
        super.addChildren(right);
        this.left = left;
        this.right = right;
    }
}
export class ANDNode extends ASTNode {
    public kind = NodeKind.AND;

    public addChildren(node: ASTNode): FilterNode {
        super.addChildren(node);
        return this;
    }
}

export class ORNode extends ASTNode {
    public kind = NodeKind.OR;

    public addChildren(node: ASTNode): FilterNode {
        super.addChildren(node);
        return this;
    }
}

export class LiteralValueNode extends ASTNode {
    public kind = NodeKind.LiteralValue;
    public value: any;

    constructor(value: any) {
        super();
        this.value = value;
    }
}

export class ProjectionNode extends ASTNode {
    public kind = NodeKind.Projection;

    addNode(node: NodeNode) {
        super.addChildren(node);
        return this;
    }
}
