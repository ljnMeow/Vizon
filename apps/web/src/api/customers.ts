import { api } from './request';

/** 更新客户信息时可修改的字段。 */
export type UpdateCustomerParams = {
  /** 昵称 */
  nickname?: string;
  /** 是否启用（软删除/停用场景） */
  is_active?: boolean;
};

/**
 * 更新指定客户的个人信息。
 *
 * @param accountId - 客户的账号 ID（由后端 /api/customers/{id}/ 路由标识）
 * @param params    - 需要更新的字段（仅传变更项）
 */
export async function updateCustomer(accountId: string, params: UpdateCustomerParams) {
  return api.put(`/api/customers/${accountId}/`, params);
}
