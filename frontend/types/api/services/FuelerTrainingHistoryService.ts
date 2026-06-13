/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FuelerTrainingHistory } from '../models/FuelerTrainingHistory';
import type { FuelerTrainingHistoryRequest } from '../models/FuelerTrainingHistoryRequest';
import type { PaginatedFuelerTrainingHistoryList } from '../models/PaginatedFuelerTrainingHistoryList';
import type { PatchedFuelerTrainingHistoryRequest } from '../models/PatchedFuelerTrainingHistoryRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FuelerTrainingHistoryService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * ViewSet for training completion history
     * @param ordering Which field to use when ordering the results.
     * @param page A page number within the paginated result set.
     * @returns PaginatedFuelerTrainingHistoryList
     * @throws ApiError
     */
    public fuelerTrainingHistoryList(
        ordering?: string,
        page?: number,
    ): CancelablePromise<PaginatedFuelerTrainingHistoryList> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/fueler-training-history/',
            query: {
                'ordering': ordering,
                'page': page,
            },
        });
    }
    /**
     * ViewSet for training completion history
     * @param requestBody
     * @returns FuelerTrainingHistory
     * @throws ApiError
     */
    public fuelerTrainingHistoryCreate(
        requestBody: FuelerTrainingHistoryRequest,
    ): CancelablePromise<FuelerTrainingHistory> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/fueler-training-history/',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * ViewSet for training completion history
     * @param id A unique integer value identifying this Fueler Training History.
     * @returns FuelerTrainingHistory
     * @throws ApiError
     */
    public fuelerTrainingHistoryRetrieve(
        id: number,
    ): CancelablePromise<FuelerTrainingHistory> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/fueler-training-history/{id}/',
            path: {
                'id': id,
            },
        });
    }
    /**
     * ViewSet for training completion history
     * @param id A unique integer value identifying this Fueler Training History.
     * @param requestBody
     * @returns FuelerTrainingHistory
     * @throws ApiError
     */
    public fuelerTrainingHistoryUpdate(
        id: number,
        requestBody: FuelerTrainingHistoryRequest,
    ): CancelablePromise<FuelerTrainingHistory> {
        return this.httpRequest.request({
            method: 'PUT',
            url: '/api/fueler-training-history/{id}/',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * ViewSet for training completion history
     * @param id A unique integer value identifying this Fueler Training History.
     * @param requestBody
     * @returns FuelerTrainingHistory
     * @throws ApiError
     */
    public fuelerTrainingHistoryPartialUpdate(
        id: number,
        requestBody?: PatchedFuelerTrainingHistoryRequest,
    ): CancelablePromise<FuelerTrainingHistory> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/api/fueler-training-history/{id}/',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * ViewSet for training completion history
     * @param id A unique integer value identifying this Fueler Training History.
     * @returns void
     * @throws ApiError
     */
    public fuelerTrainingHistoryDestroy(
        id: number,
    ): CancelablePromise<void> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/api/fueler-training-history/{id}/',
            path: {
                'id': id,
            },
        });
    }
}
