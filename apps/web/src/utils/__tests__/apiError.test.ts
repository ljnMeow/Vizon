import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/request';
import { getApiErrorMessage, isMeaningfulApiMessage, mergeUploadErrorMessages } from '../apiError';

describe('apiError', () => {
  it('优先使用接口返回的 message', () => {
    const err = new ApiError('文件格式不支持');
    expect(getApiErrorMessage(err, '上传失败，请稍后重试')).toBe('文件格式不支持');
  });

  it('占位 message 时回退到自定义文案', () => {
    expect(getApiErrorMessage(new ApiError('error'), '上传失败，请稍后重试')).toBe('上传失败，请稍后重试');
    expect(getApiErrorMessage(new ApiError(''), '自定义失败')).toBe('自定义失败');
  });

  it('isMeaningfulApiMessage 识别空值与占位符', () => {
    expect(isMeaningfulApiMessage('业务错误')).toBe(true);
    expect(isMeaningfulApiMessage('error')).toBe(false);
    expect(isMeaningfulApiMessage(null)).toBe(false);
  });

  it('mergeUploadErrorMessages 去重合并', () => {
    expect(mergeUploadErrorMessages(['A', 'A', 'B'])).toBe('A；B');
  });
});
