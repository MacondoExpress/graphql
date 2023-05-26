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

import type { ASTNode, EnterLeaveVisit, Visitor } from "./ast";

class PrintVisit implements EnterLeaveVisit<ASTNode> {
    private level = 0;
    enter() {
        this.level += 1;
    }
    leave(ASTNode: ASTNode, nestedResults: []): string {
        // I'll receive punishment from the ASCII art gods
        if (this.level === 1) {
            return `${ASTNode.kind}\n${nestedResults.join("")}`;
        } else {
            this.level -= 1;
            return `│${new Array(3 * this.level).join(" ")}├─ ${ASTNode.kind}\n${nestedResults.join("")}`;
        }
    }
}

export class PrintVisitor implements Visitor {
    public Node: EnterLeaveVisit;
    public Relationship: EnterLeaveVisit;
    public Attribute: EnterLeaveVisit;
    public Projection: EnterLeaveVisit;
    public Filter: EnterLeaveVisit;
    public LiteralValue: EnterLeaveVisit;
    public EQ: EnterLeaveVisit;
    private sb: PrintVisit;

    constructor() {
        this.sb = new PrintVisit();
        this.Node = this.sb;
        this.Relationship = this.sb;
        this.Attribute = this.sb;
        this.Projection = this.sb;
        this.Filter = this.sb;
        this.LiteralValue = this.sb;
        this.EQ = this.sb;
    }
}

class StatePrintVisit implements EnterLeaveVisit<ASTNode> {
    private buffer = "";
    private level = 0;

    enter(ASTNode: ASTNode) {
        this.level += 1;
        if (this.level === 1) {
            this.buffer += `${ASTNode.kind}\n`;
        } else {
            this.buffer += `│${new Array(3 * this.level - 1).join(" ")}├─ ${ASTNode.kind}\n`;
        }
    }
    leave() {
        this.level -= 1;
    }
    print(): string {
        return this.buffer;
    }
}

// Just an example of to rewrite the PrintVisitor accumulating state within the visitor
export class StatePrintVisitor implements Visitor {
    public Node: EnterLeaveVisit;
    public Relationship: EnterLeaveVisit;
    public Attribute: EnterLeaveVisit;
    public Projection: EnterLeaveVisit;
    public Filter: EnterLeaveVisit;
    public LiteralValue: EnterLeaveVisit;
    public EQ: EnterLeaveVisit;
    private sb: StatePrintVisit;

    constructor() {
        this.sb = new StatePrintVisit();
        this.Node = this.sb;
        this.Relationship = this.sb;
        this.Attribute = this.sb;
        this.Projection = this.sb;
        this.Filter = this.sb;
        this.LiteralValue = this.sb;
        this.EQ = this.sb;
    }
    print(): string {
        return this.sb.print();
    }
}
