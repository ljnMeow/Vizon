import { api } from './request';

export type UpdateCustomerParams = {
  nickname?: string;
  is_active?: boolean;
};

export async function updateCustomer(accountId: string, params: UpdateCustomerParams) {
  return api.put(`/api/customers/${accountId}/`, params);
}

