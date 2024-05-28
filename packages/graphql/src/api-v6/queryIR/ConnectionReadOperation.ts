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
import type { ConcreteEntityAdapter } from "../../schema-model/entity/model-adapters/ConcreteEntityAdapter";
import type { RelationshipAdapter } from "../../schema-model/relationship/model-adapters/RelationshipAdapter";
import type { QueryASTContext } from "../../translate/queryAST/ast/QueryASTContext";
import type { QueryASTNode } from "../../translate/queryAST/ast/QueryASTNode";
import type { Field } from "../../translate/queryAST/ast/fields/Field";
import { OperationField } from "../../translate/queryAST/ast/fields/OperationField";
import type { Filter } from "../../translate/queryAST/ast/filters/Filter";
import type { AuthorizationFilters } from "../../translate/queryAST/ast/filters/authorization-filters/AuthorizationFilters";
import { CypherScalarOperation } from "../../translate/queryAST/ast/operations/CypherScalarOperation";
import { Operation, type OperationTranspileResult } from "../../translate/queryAST/ast/operations/operations";
import type { Pagination } from "../../translate/queryAST/ast/pagination/Pagination";
import type { EntitySelection } from "../../translate/queryAST/ast/selection/EntitySelection";
import { CypherPropertySort } from "../../translate/queryAST/ast/sort/CypherPropertySort";
import type { Sort, SortField } from "../../translate/queryAST/ast/sort/Sort";
import { wrapSubqueriesInCypherCalls } from "../../translate/queryAST/utils/wrap-subquery-in-calls";
import { filterTruthy } from "../../utils/utils";

export class V6ReadOperation extends Operation {
    public readonly relationship: RelationshipAdapter | undefined;
    public readonly target: ConcreteEntityAdapter;

    public nodeFields: Field[] = [];
    public edgeFields: Field[] = []; // TODO: merge with attachedTo?
    protected filters: Filter[] = [];
    protected pagination: Pagination | undefined;
    protected sortFields: Array<{ node: Sort[]; edge: Sort[] }> = [];
    protected authFilters: AuthorizationFilters[] = [];

    protected selection: EntitySelection;

    constructor({
        relationship,
        target,
        selection,
        fields,
        sortFields,
        pagination,
        filters,
    }: {
        relationship?: RelationshipAdapter;
        target: ConcreteEntityAdapter;
        selection: EntitySelection;
        fields?: {
            node: Field[];
            edge: Field[];
        };
        pagination?: Pagination;
        sortFields?: Array<{ node: Sort[]; edge: Sort[] }>;
        filters: Filter[];
    }) {
        super();
        this.relationship = relationship;
        this.target = target;
        this.selection = selection;
        this.nodeFields = fields?.node ?? [];
        this.edgeFields = fields?.edge ?? [];
        this.sortFields = sortFields ?? [];
        this.pagination = pagination;
        this.filters = filters ?? [];
    }

    public setNodeFields(fields: Field[]) {
        this.nodeFields = fields;
    }

    public addFilters(...filters: Filter[]) {
        this.filters.push(...filters);
    }

    public setEdgeFields(fields: Field[]) {
        this.edgeFields = fields;
    }

    public addAuthFilters(...filter: AuthorizationFilters[]) {
        this.authFilters.push(...filter);
    }

    public addSort(sortElement: { node: Sort[]; edge: Sort[] }): void {
        this.sortFields.push(sortElement);
    }

    public addPagination(pagination: Pagination): void {
        this.pagination = pagination;
    }

    public getChildren(): QueryASTNode[] {
        const sortFields = this.sortFields.flatMap((s) => {
            return [...s.edge, ...s.node];
        });

        return filterTruthy([
            this.selection,
            ...this.nodeFields,
            ...this.edgeFields,
            ...this.filters,
            ...this.authFilters,
            this.pagination,
            ...sortFields,
        ]);
    }

    public transpile(context: QueryASTContext): OperationTranspileResult {
        if (!context.target) throw new Error();

        // eslint-disable-next-line prefer-const
        let { selection: selectionClause, nestedContext } = this.selection.apply(context);

        let extraMatches: Array<Cypher.Match | Cypher.With | Cypher.Yield> = this.getChildren().flatMap((f) => {
            return f.getSelection(nestedContext);
        });

        if (extraMatches.length > 0) {
            extraMatches = [selectionClause, ...extraMatches];
            selectionClause = new Cypher.With("*");
        }

        const authFilterSubqueries = this.getAuthFilterSubqueries(nestedContext).map((sq) => {
            return new Cypher.Call(sq).importWith(nestedContext.target);
        });

        const normalFilterSubqueries = this.getFilterSubqueries(nestedContext).map((sq) => {
            return new Cypher.Call(sq).importWith(nestedContext.target);
        });

        const filtersSubqueries = [...authFilterSubqueries, ...normalFilterSubqueries];

        const edgesVar = new Cypher.NamedVariable("edges");
        const totalCount = new Cypher.NamedVariable("totalCount");
        const edgesProjectionVar = new Cypher.Variable();

        const unwindAndProjectionSubquery = this.createUnwindAndProjectionSubquery(
            nestedContext,
            edgesVar,
            edgesProjectionVar
        );

        let withWhere: Cypher.With | undefined;

        if (filtersSubqueries.length > 0) {
            withWhere = new Cypher.With("*");
            this.addFiltersToClause(withWhere, nestedContext);
        } else {
            this.addFiltersToClause(selectionClause, nestedContext);
        }

        const nodeAndRelationshipMap = new Cypher.Map({
            node: nestedContext.target,
        });

        if (nestedContext.relationship) {
            nodeAndRelationshipMap.set("relationship", nestedContext.relationship);
        }

        const withCollectEdgesAndTotalCount = new Cypher.With([Cypher.collect(nodeAndRelationshipMap), edgesVar]).with(
            edgesVar,
            [Cypher.size(edgesVar), totalCount]
        );

        const returnClause = new Cypher.Return([
            new Cypher.Map({
                connection: new Cypher.Map({
                    edges: edgesProjectionVar,
                    totalCount: totalCount,
                }),
            }),
            context.returnVariable,
        ]);

        return {
            clauses: [
                Cypher.concat(
                    ...extraMatches,
                    selectionClause,
                    ...filtersSubqueries,
                    withWhere,
                    withCollectEdgesAndTotalCount,
                    unwindAndProjectionSubquery,
                    returnClause
                ),
            ],
            projectionExpr: context.returnVariable,
        };
    }

    protected getAuthFilterSubqueries(context: QueryASTContext): Cypher.Clause[] {
        return this.authFilters.flatMap((f) => f.getSubqueries(context));
    }

    protected getFilterSubqueries(context: QueryASTContext): Cypher.Clause[] {
        return this.filters.flatMap((f) => f.getSubqueries(context));
    }

    protected getAuthFilterPredicate(context: QueryASTContext): Cypher.Predicate[] {
        return filterTruthy(this.authFilters.map((f) => f.getPredicate(context)));
    }

    private createUnwindAndProjectionSubquery(
        context: QueryASTContext<Cypher.Node>,
        edgesVar: Cypher.Variable,
        returnVar: Cypher.Variable
    ) {
        const edgeVar = new Cypher.NamedVariable("edge");
        const { prePaginationSubqueries, postPaginationSubqueries } = this.getPreAndPostSubqueries(context);

        let unwindClause: Cypher.With;
        if (context.relationship) {
            unwindClause = new Cypher.Unwind([edgesVar, edgeVar]).with(
                [edgeVar.property("node"), context.target],
                [edgeVar.property("relationship"), context.relationship]
            );
        } else {
            unwindClause = new Cypher.Unwind([edgesVar, edgeVar]).with([edgeVar.property("node"), context.target]);
        }

        const edgeProjectionMap = this.createProjectionMapForEdge(context);

        const paginationWith = this.generateSortAndPaginationClause(context);

        return new Cypher.Call(
            Cypher.concat(
                unwindClause,
                ...prePaginationSubqueries,
                paginationWith,
                ...postPaginationSubqueries,
                new Cypher.Return([Cypher.collect(edgeProjectionMap), returnVar])
            )
        ).importWith(edgesVar);
    }

    private createProjectionMapForEdge(context: QueryASTContext<Cypher.Node>): Cypher.Map {
        const nodeProjectionMap = this.generateProjectionMapForFields(this.nodeFields, context.target);
        if (nodeProjectionMap.size === 0) {
            nodeProjectionMap.set({
                __id: Cypher.id(context.target),
            });
        }
        nodeProjectionMap.set({
            __resolveType: new Cypher.Literal(this.target.name),
        });

        const edgeProjectionMap = new Cypher.Map();

        if (context.relationship) {
            const propertiesProjectionMap = this.generateProjectionMapForFields(this.edgeFields, context.relationship);
            if (propertiesProjectionMap.size) {
                if (this.relationship?.propertiesTypeName) {
                    // should be true if getting here but just in case..
                    propertiesProjectionMap.set(
                        "__resolveType",
                        new Cypher.Literal(this.relationship.propertiesTypeName)
                    );
                }
                edgeProjectionMap.set("properties", propertiesProjectionMap);
            }
        }

        edgeProjectionMap.set("node", nodeProjectionMap);
        return edgeProjectionMap;
    }

    private generateProjectionMapForFields(fields: Field[], target: Cypher.Variable): Cypher.Map {
        const projectionMap = new Cypher.Map();
        fields
            .map((f) => f.getProjectionField(target))
            .forEach((p) => {
                if (typeof p === "string") {
                    projectionMap.set(p, target.property(p));
                } else {
                    projectionMap.set(p);
                }
            });

        return projectionMap;
    }

    private generateSortAndPaginationClause(context: QueryASTContext<Cypher.Node>): Cypher.With | undefined {
        const shouldGenerateSortWith = this.pagination || this.sortFields.length > 0;
        if (!shouldGenerateSortWith) {
            return;
        }
        const paginationWith = new Cypher.With("*");
        this.addPaginationSubclauses(paginationWith);
        this.addSortSubclause(paginationWith, context);

        return paginationWith;
    }

    private addPaginationSubclauses(clause: Cypher.With): void {
        const paginationField = this.pagination && this.pagination.getPagination();
        if (paginationField?.limit) {
            clause.limit(paginationField.limit);
        }
        if (paginationField?.skip) {
            clause.skip(paginationField.skip);
        }
    }

    private addSortSubclause(clause: Cypher.With, context: QueryASTContext<Cypher.Node>): void {
        if (this.sortFields.length > 0) {
            const sortFields = this.getSortFields({
                context: context,
                nodeVar: context.target,
                edgeVar: context.relationship,
            });
            clause.orderBy(...sortFields);
        }
    }

    private addFiltersToClause(
        clause: Cypher.With | Cypher.Match | Cypher.Yield,
        context: QueryASTContext<Cypher.Node>
    ): void {
        const predicates = this.filters.map((f) => f.getPredicate(context));
        const authPredicate = this.getAuthFilterPredicate(context);
        const predicate = Cypher.and(...predicates, ...authPredicate);
        if (predicate) {
            clause.where(predicate);
        }
    }

    private getSortFields({
        context,
        nodeVar,
        edgeVar,
    }: {
        context: QueryASTContext;
        nodeVar: Cypher.Variable | Cypher.Property;
        edgeVar?: Cypher.Variable | Cypher.Property;
    }): SortField[] {
        const aliasSort = true;
        return this.sortFields.flatMap(({ node, edge }) => {
            const nodeFields = node.flatMap((s) => s.getSortFields(context, nodeVar, aliasSort));
            if (edgeVar) {
                const edgeFields = edge.flatMap((s) => s.getSortFields(context, edgeVar, aliasSort));
                return [...nodeFields, ...edgeFields];
            }
            return nodeFields;
        });
    }
    /**
     *  This method resolves all the subqueries for each field and splits them into separate fields: `prePaginationSubqueries` and `postPaginationSubqueries`,
     *  in the `prePaginationSubqueries` are present all the subqueries required for the pagination purpose.
     **/
    private getPreAndPostSubqueries(context: QueryASTContext): {
        prePaginationSubqueries: Cypher.Clause[];
        postPaginationSubqueries: Cypher.Clause[];
    } {
        if (!context.hasTarget()) {
            throw new Error("No parent node found!");
        }
        const sortNodeFields = this.sortFields.flatMap((sf) => sf.node);
        /**
         * cypherSortFieldsFlagMap is a Record<string, boolean> that holds the name of the sort field as key
         * and a boolean flag defined as true when the field is a `@cypher` field.
         **/
        const cypherSortFieldsFlagMap = sortNodeFields.reduce<Record<string, boolean>>(
            (sortFieldsFlagMap, sortField) => {
                if (sortField instanceof CypherPropertySort) {
                    sortFieldsFlagMap[sortField.getFieldName()] = true;
                }
                return sortFieldsFlagMap;
            },
            {}
        );

        const preAndPostFields = this.nodeFields.reduce<Record<"Pre" | "Post", Field[]>>(
            (acc, nodeField) => {
                if (
                    nodeField instanceof OperationField &&
                    nodeField.isCypherField() &&
                    nodeField.operation instanceof CypherScalarOperation
                ) {
                    const cypherFieldName = nodeField.operation.cypherAttributeField.name;
                    if (cypherSortFieldsFlagMap[cypherFieldName]) {
                        acc.Pre.push(nodeField);
                        return acc;
                    }
                }

                acc.Post.push(nodeField);
                return acc;
            },
            { Pre: [], Post: [] }
        );
        const preNodeSubqueries = wrapSubqueriesInCypherCalls(context, preAndPostFields.Pre, [context.target]);
        const postNodeSubqueries = wrapSubqueriesInCypherCalls(context, preAndPostFields.Post, [context.target]);
        const sortSubqueries = wrapSubqueriesInCypherCalls(context, sortNodeFields, [context.target]);

        return {
            prePaginationSubqueries: [...sortSubqueries, ...preNodeSubqueries],
            postPaginationSubqueries: postNodeSubqueries,
        };
    }
}
