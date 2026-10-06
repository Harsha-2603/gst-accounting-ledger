export interface PaymentAllocationInput {
    invoiceId: string;
    amount: number | string;
}
export interface RecordPaymentDTO {
    customerId: string;
    paymentDate?: string;
    amount: number | string;
    depositAccountId: string;
    referenceNumber?: string;
    allocations: PaymentAllocationInput[];
}
export declare function recordPayment(data: RecordPaymentDTO): any;
export declare function getPayments(): any[];
