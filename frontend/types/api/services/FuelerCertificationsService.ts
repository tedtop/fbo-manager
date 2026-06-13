/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FuelerTraining } from '../models/FuelerTraining';
import type { FuelerTrainingRequest } from '../models/FuelerTrainingRequest';
import type { PaginatedFuelerTrainingList } from '../models/PaginatedFuelerTrainingList';
import type { PatchedFuelerTrainingRequest } from '../models/PatchedFuelerTrainingRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FuelerCertificationsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * ViewSet for fueler training certifications
     * @param ordering Which field to use when ordering the results.
     * @param page A page number within the paginated result set.
     * @returns PaginatedFuelerTrainingList
     * @throws ApiError
     */
    public fuelerCertificationsList(
        ordering?: string,
        page?: number,
    ): CancelablePromise<PaginatedFuelerTrainingList> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/fueler-certifications/',
            query: {
                'ordering': ordering,
                'page': page,
            },
        });
    }
    /**
     * ViewSet for fueler training certifications
     * @param requestBody
     * @returns FuelerTraining
     * @throws ApiError
     */
    public fuelerCertificationsCreate(
        requestBody: FuelerTrainingRequest,
    ): CancelablePromise<FuelerTraining> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/fueler-certifications/',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * ViewSet for fueler training certifications
     * @param id A unique integer value identifying this Fueler Training.
     * @returns FuelerTraining
     * @throws ApiError
     */
    public fuelerCertificationsRetrieve(
        id: number,
    ): CancelablePromise<FuelerTraining> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/fueler-certifications/{id}/',
            path: {
                'id': id,
            },
        });
    }
    /**
     * ViewSet for fueler training certifications
     * @param id A unique integer value identifying this Fueler Training.
     * @param requestBody
     * @returns FuelerTraining
     * @throws ApiError
     */
    public fuelerCertificationsUpdate(
        id: number,
        requestBody: FuelerTrainingRequest,
    ): CancelablePromise<FuelerTraining> {
        return this.httpRequest.request({
            method: 'PUT',
            url: '/api/fueler-certifications/{id}/',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * ViewSet for fueler training certifications
     * @param id A unique integer value identifying this Fueler Training.
     * @param requestBody
     * @returns FuelerTraining
     * @throws ApiError
     */
    public fuelerCertificationsPartialUpdate(
        id: number,
        requestBody?: PatchedFuelerTrainingRequest,
    ): CancelablePromise<FuelerTraining> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/api/fueler-certifications/{id}/',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * ViewSet for fueler training certifications
     * @param id A unique integer value identifying this Fueler Training.
     * @returns void
     * @throws ApiError
     */
    public fuelerCertificationsDestroy(
        id: number,
    ): CancelablePromise<void> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/api/fueler-certifications/{id}/',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Return calendar events for training completions and upcoming expiries in a date range.
     *
     * Query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD)
     * Defaults to today to +30 days for expiries and last 30 days for completions if omitted.
     * @returns FuelerTraining
     * @throws ApiError
     */
    public fuelerCertificationsCalendarRetrieve(): CancelablePromise<FuelerTraining> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/fueler-certifications/calendar/',
        });
    }
    /**
     * Assign and/or complete a training for a fueler, computing expiry as needed.
     *
     * Expects: fueler (id), training (id), completed_date (YYYY-MM-DD, optional),
     * expiry_date (optional), notes (optional). Uses request.user as certified_by.
     * @param requestBody
     * @returns FuelerTraining
     * @throws ApiError
     */
    public fuelerCertificationsCompleteCreate(
        requestBody: FuelerTrainingRequest,
    ): CancelablePromise<FuelerTraining> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/fueler-certifications/complete/',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
