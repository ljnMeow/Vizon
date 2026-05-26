import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  awaitModelTexturesLoaded,
  detectModelFormat,
  getModelEntryFileName,
  resolveMediaUrl,
} from '../modelLoadUtils';

describe('detectModelFormat', () => {
  it('以 URL 扩展名为准，不被 ZIP 展示名误导', () => {
    expect(
      detectModelFormat(
        'http://127.0.0.1:5018/media/models3d/files/uuid/sub/model.fbx',
        'factory.zip'
      )
    ).toBe('fbx');
  });

  it('用户重命名为 .gltf 时仍以 URL 中的 .fbx 为准', () => {
    expect(
      detectModelFormat('/media/models3d/files/uuid/model.fbx', '角色.gltf')
    ).toBe('fbx');
  });

  it('无 URL 扩展名时回退展示名', () => {
    expect(detectModelFormat('/api/models3d/1/file/', 'chair.obj')).toBe('obj');
  });
});

describe('getModelEntryFileName', () => {
  it('从 URL 路径取入口文件名', () => {
    expect(
      getModelEntryFileName('/media/models3d/files/uuid/nested/model.fbx', 'factory.zip')
    ).toBe('model.fbx');
  });
});

describe('resolveMediaUrl', () => {
  it('非浏览器环境原样返回', () => {
    expect(resolveMediaUrl('http://127.0.0.1:5018/media/a.fbx')).toBe(
      'http://127.0.0.1:5018/media/a.fbx'
    );
  });
});

describe('awaitModelTexturesLoaded', () => {
  it('ImageBitmap 贴图不阻塞等待', async () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({
        map: Object.assign(new THREE.Texture(), {
          image: { width: 1, height: 1 } as ImageBitmap,
        }),
      })
    );
    await expect(awaitModelTexturesLoaded(mesh)).resolves.toBeUndefined();
  });
});
