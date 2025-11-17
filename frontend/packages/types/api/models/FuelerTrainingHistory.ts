/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type FuelerTrainingHistory = {
    readonly id: number;
    fueler: number;
    readonly fueler_name: string;
    training: number;
    readonly training_name: string;
    completed_date: string;
    expiry_date: string;
    certified_by?: number | null;
    readonly certified_by_name: string;
    notes?: string;
    readonly created_at: string;
};

