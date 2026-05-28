import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VIZON_USER_DATA_KEYS } from '../../infra/utils/keys';
import {
  awaitModelTexturesLoaded,
  detectModelFormat,
  ensureLockedModelGroupRoot,
  getModelEntryFileName,
  resolveMediaUrl,
} from '../modelLoadUtils';

describe('detectModelFormat', () => {
  it('以 URL 扩展名为准，不被 ZIP 展示名误导', () => {
    expect(
      detectModelFormat(
        'http://127.0.0.1:5018/media/models3d/files/uuid/sub/model.glb',
        'factory.zip'
      )
    ).toBe('glb');
  });

  it('用户重命名为 .obj 时仍以 URL 中的 .glb 为准', () => {
    expect(
      detectModelFormat('/media/models3d/files/uuid/model.glb', '角色.obj')
    ).toBe('glb');
  });

  it('无 URL 扩展名时回退展示名', () => {
    expect(detectModelFormat('/api/models3d/1/file/', 'chair.obj')).toBe('obj');
  });
});

describe('getModelEntryFileName', () => {
  it('从 URL 路径取入口文件名', () => {
    expect(
      getModelEntryFileName('/media/models3d/files/uuid/nested/model.glb', 'factory.zip')
    ).toBe('model.glb');
  });
});

describe('resolveMediaUrl', () => {
  it('非浏览器环境原样返回', () => {
    expect(resolveMediaUrl('http://127.0.0.1:5018/media/a.glb')).toBe(
      'http://127.0.0.1:5018/media/a.glb'
    );
  });
});

describe('ensureLockedModelGroupRoot', () => {
  it('根为 Group 时直接锁定原节点', () => {
    const root = new THREE.Group();
    root.name = 'GLTF Scene';

    const out = ensureLockedModelGroupRoot(root);

    expect(out).toBe(root);
    expect(out.userData[VIZON_USER_DATA_KEYS.COMMON.LOCKED]).toBe(true);
    expect(out.children).toHaveLength(0);
  });

  it('根非 Group 时外包 Group 并锁定外层', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = 'Body';

    const out = ensureLockedModelGroupRoot(mesh);

    expect(out.type).toBe('Group');
    expect(out.userData[VIZON_USER_DATA_KEYS.COMMON.LOCKED]).toBe(true);
    expect(out.children).toHaveLength(1);
    expect(out.children[0]).toBe(mesh);
    expect(mesh.userData[VIZON_USER_DATA_KEYS.COMMON.LOCKED]).toBeUndefined();
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
