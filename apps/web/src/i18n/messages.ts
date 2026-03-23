import type { Locale } from '../hooks/useLocale';

/**
 * 全局 i18n 文案字典入口。
 * 约定按「模块」分组，方便后续在整个项目中复用。
 */
export interface AppMessages {
  common: {
    brandName: string;
    confirm: string;
    cancel: string;
    processing: string;
  };
  auth: {
    sessionInvalidToast: string;
    logoutSuccessToast: string;
    missingAccountIdToast: string;
    login: {
      title: string;
      subtitle: string;
      badge: string;
      heroBody: string;

      emailLabel: string;
      emailPlaceholder: string;
      passwordLabel: string;
      passwordPlaceholder: string;
      rememberMe: string;
      forgotPassword: string;
      loginButton: string;
      noAccount: string;

      toastSigningIn: string;
      toastSignedIn: string;
      toastLoginFailed: string;
      toastCheckingLogin: string;
      toastAlreadyLoggedIn: string;

      showPassword: string;
      hidePassword: string;

      themeDark: string;
      themeLight: string;
      localeSwitcher: string;
    };
  };
  navigation?: {
    dashboard?: string;
    scenes?: string;
    assets?: string;
    settings?: string;
  };
  profile: {
    profileDialogTitle: string;
    profileDialogConfirm: string;
    profileDialogCancel: string;
    profileMenuLabel: string;
    logoutMenuLabel: string;
    nicknameLabel: string;
    nicknamePlaceholder: string;
    nicknameRequiredToast: string;
    savingToast: string;
    savedToast: string;
    updateFailedToast: string;
  };
  assetPane: {
    systemTab: string;
    mineTab: string;
    structureTab: string;
    systemPlaceholder: string;
    minePlaceholder: string;
    structurePlaceholder: string;
  };
  systemAssets: {
    modelsTab: string;
    camerasTab: string;
    lightsTab: string;
    materialsTab: string;
    lightNames: {
      ambientLight: string;
      directionalLight: string;
      pointLight: string;
      spotLight: string;
      hemisphereLight: string;
      rectAreaLight: string;
    };
    materialsPlaceholder: string;
  };
  modelNames: {
    cube: string;
    sphere: string;
    plane: string;
    circular: string;
    cone: string;
    cylinder: string;
    torus: string;
    theConduit: string;
  };
  designPage: {
    viewport: {
      viewPresets: {
        default: string;
        front: string;
        back: string;
        left: string;
        right: string;
        top: string;
        bottom: string;
      };
      tools: {
        translate: string;
        zoom: string;
        rotate: string;
      };
    };
    inspector: {
      tabs: {
        scene: string;
        data: string;
        interaction: string;
      };
      placeholders: {
        scene: string;
        data: string;
        interaction: string;
      };
      sceneSettings: {
        title: string;
        sceneNameLabel: string;
        sceneNamePlaceholder: string;
        descriptionLabel: string;
        descriptionPlaceholder: string;
        environmentSettings: {
          title: string;
          backgroundModeLabel: string;
          backgroundModeOptions: {
            solid: string;
            skybox: string;
          };
          backgroundColorLabel: string;
          environmentHdriLabel: string;
          environmentHdriUploadLabel: string;
          environmentHdriSelectPlaceholder: string;
          environmentHdriPreviewLabel: string;
          environmentHdriPreviewTitle: string;
          environmentHdriPreviewLoading: string;
          environmentHdriPreviewUnsupported: string;
          environmentHdriPreviewError: string;
          environmentStrengthLabel: string;
          fogToggleLabel: string;
          fogColorLabel: string;
          fogNearLabel: string;
          fogFarLabel: string;
        };
        rendererSettings: {
          title: string;

          antialiasLabel: string;

          outputColorSpaceLabel: string;
          outputColorSpaceOptions: {
            SRGBColorSpace: string;
            LinearSRGBColorSpace: string;
          };

          toneMappingLabel: string;
          toneMappingOptions: {
            NoToneMapping: string;
            LinearToneMapping: string;
            ReinhardToneMapping: string;
            CineonToneMapping: string;
            ACESFilmicToneMapping: string;
          };

          toneMappingExposureLabel: string;

          shadowMapEnabledLabel: string;
          shadowMapTypeLabel: string;
          shadowMapTypeOptions: {
            BasicShadowMap: string;
            PCFShadowMap: string;
            PCFSoftShadowMap: string;
          };
          shadowMapAutoUpdateLabel: string;
        };
        cameraSettings: {
          title: string;
          fovLabel: string;
          nearLabel: string;
          farLabel: string;
          positionLabel: string;
          targetLabel: string;
          resetCameraLabel: string;
        };
        helpersSettings: {
          title: string;
          axisTitle: string;
          axisEnabledLabel: string;
          axisSizeLabel: string;
        };
        gridSettings: {
          title: string;
          enabledLabel: string;
          colorLabel: string;
          opacityLabel: string;
        };
      };
    };
  };
}

export const appMessages: Record<Locale, AppMessages> = {
  'zh-CN': {
    common: {
      brandName: '维造',
      confirm: '确定',
      cancel: '取消',
      processing: '处理中...'
    },
    auth: {
      sessionInvalidToast: '登录状态失效，请重新登录',
      logoutSuccessToast: '已退出登录',
      missingAccountIdToast: '缺少 account_id（请重新登录后再试）',
      login: {
        title: '维造',
        subtitle: '使用企业账号登录，开始编辑你的 3D 场景。',
        badge: '实时 3D 监控 · 组态搭建 · 企业协作',
        heroBody:
          '从生产线监控到数字孪生搭建，你的每一个 3D 场景都可以在这里快速编排、预览与协作。登录后即可访问你的资产库与项目空间。',
        emailLabel: '邮箱',
        emailPlaceholder: '请输入邮箱',
        passwordLabel: '密码',
        passwordPlaceholder: '请输入密码',
        rememberMe: '记住账号',
        forgotPassword: '忘记密码？',
        loginButton: '登录',
        noAccount: '尚未开通账号？请联系系统管理员。',
        toastSigningIn: '登录中...',
        toastSignedIn: '登录成功',
        toastLoginFailed: '登录失败',
        toastCheckingLogin: '检查登录状态...',
        toastAlreadyLoggedIn: '已登录，正在进入...',
        showPassword: '显示密码',
        hidePassword: '隐藏密码',
        themeDark: '深色主题',
        themeLight: '浅色主题',
        localeSwitcher: '中 / EN'
      }
    },
    navigation: {
      dashboard: '总览',
      scenes: '场景',
      assets: '资产库',
      settings: '设置'
    },
    profile: {
      profileDialogTitle: '个人中心',
      profileDialogConfirm: '保存',
      profileDialogCancel: '取消',
      profileMenuLabel: '个人中心',
      logoutMenuLabel: '退出',
      nicknameLabel: '昵称',
      nicknamePlaceholder: '请输入昵称',
      nicknameRequiredToast: '昵称不能为空',
      savingToast: '保存中...',
      savedToast: '保存成功',
      updateFailedToast: '更新失败'
    },
    assetPane: {
      systemTab: '系统资源',
      mineTab: '我的资源',
      structureTab: '结构',
      systemPlaceholder: '系统预设资源将在这里展示。',
      minePlaceholder: '用户上传的资源将在这里展示。',
      structurePlaceholder: '场景结构树将在这里展示。'
    },
    systemAssets: {
      modelsTab: '模型',
      camerasTab: '相机',
      lightsTab: '灯光',
      materialsTab: '材质',
      lightNames: {
        ambientLight: '环境光',
        directionalLight: '平行光',
        pointLight: '点光源',
        spotLight: '聚光灯',
        hemisphereLight: '半球光',
        rectAreaLight: '矩形光'
      },
      materialsPlaceholder: '预设材质将在这里展示。'
    },
    modelNames: {
      cube: '立方体',
      sphere: '球体',
      plane: '平面',
      circular: '圆',
      cone: '圆锥体',
      cylinder: '圆柱体',
      torus: '圆环体',
      theConduit: '管道'
    },
    designPage: {
      viewport: {
        viewPresets: {
          default: '默认视角',
          front: '前视图',
          back: '后视图',
          left: '左视图',
          right: '右视图',
          top: '顶视图',
          bottom: '底视图'
        },
        tools: {
          translate: '平移',
          zoom: '缩放',
          rotate: '旋转'
        }
      },
      inspector: {
        tabs: {
          scene: '场景',
          data: '数据',
          interaction: '交互'
        },
        placeholders: {
          scene: '这里将来是场景属性（Scene）',
          data: '这里将来是数据属性（Data）',
          interaction: '这里将来是交互属性（Interaction）'
        },
        sceneSettings: {
          title: '基础设置',
          sceneNameLabel: '场景名称',
          sceneNamePlaceholder: '请输入场景名称',
          descriptionLabel: '详细描述',
          descriptionPlaceholder: '请输入详细描述',
          environmentSettings: {
            title: '环境',
            backgroundModeLabel: '背景模式',
            backgroundModeOptions: {
              solid: '纯色 (Solid)',
              skybox: '天空盒 (Skybox)'
            },
            backgroundColorLabel: '背景颜色',
            environmentHdriLabel: '环境贴图 (HDR)',
            environmentHdriUploadLabel: '上传 HDR',
            environmentHdriSelectPlaceholder: '选择/导入 HDR 贴图',
            environmentHdriPreviewLabel: '预览',
            environmentHdriPreviewTitle: '图片预览',
            environmentHdriPreviewLoading: '加载中...',
            environmentHdriPreviewUnsupported: '暂不支持预览该文件格式',
            environmentHdriPreviewError: '预览失败，请重试',
            environmentStrengthLabel: '环境强度',
            fogToggleLabel: '全局雾化 (Fog)',
            fogColorLabel: '雾颜色',
            fogNearLabel: '近距',
            fogFarLabel: '远距'
          },
          rendererSettings: {
            title: '渲染器',
            antialiasLabel: '抗锯齿（Antialias）',
            outputColorSpaceLabel: '输出色彩空间',
            outputColorSpaceOptions: {
              SRGBColorSpace: 'sRGB',
              LinearSRGBColorSpace: 'Linear sRGB'
            },
            toneMappingLabel: '色调映射（Tone Mapping）',
            toneMappingOptions: {
              NoToneMapping: '无（NoToneMapping）',
              LinearToneMapping: '线性（Linear）',
              ReinhardToneMapping: 'Reinhard色调映射',
              CineonToneMapping: 'Cineon色调映射',
              ACESFilmicToneMapping: 'ACES Filmic色调映射'
            },
            toneMappingExposureLabel: '曝光（Exposure）',
            shadowMapEnabledLabel: '启用阴影（Shadow Map）',
            shadowMapTypeLabel: '阴影类型（Shadow Type）',
            shadowMapTypeOptions: {
              BasicShadowMap: '基础（Basic）',
              PCFShadowMap: 'PCF软阴影',
              PCFSoftShadowMap: 'PCF Soft阴影'
            },
            shadowMapAutoUpdateLabel: '自动更新阴影（Auto Update）'
          },
          cameraSettings: {
            title: '相机',
            fovLabel: '视野（FOV）',
            nearLabel: '近平面（Near）',
            farLabel: '远平面（Far）',
            positionLabel: '相机位置',
            targetLabel: '观察目标（Target）',
            resetCameraLabel: '复位相机'
          },
          helpersSettings: {
            title: '辅助器',
            axisTitle: '坐标轴辅助',
            axisEnabledLabel: '显示坐标轴',
            axisSizeLabel: '坐标轴尺寸'
          },
          gridSettings: {
            title: '网格',
            enabledLabel: '显示网格',
            colorLabel: '网格颜色',
            opacityLabel: '网格透明度'
          }
        }
      }
    }
  },
  'en-US': {
    common: {
      brandName: 'Vizon',
      confirm: 'Confirm',
      cancel: 'Cancel',
      processing: 'Processing...'
    },
    auth: {
      sessionInvalidToast: 'Your session has expired. Please sign in again.',
      logoutSuccessToast: 'Signed out',
      missingAccountIdToast: 'Missing account_id (please sign in again).',
      login: {
        title: 'Vizon',
        subtitle: 'Use your enterprise account to start editing 3D scenes.',
        badge: 'Real‑time 3D monitoring · Configuration · Collaboration',
        heroBody:
          'From production line monitoring to digital twin experiences, assemble and preview every 3D scene in one place. Sign in to access your asset library and project workspace.',
        emailLabel: 'Email',
        emailPlaceholder: 'you@company.com',
        passwordLabel: 'Password',
        passwordPlaceholder: 'Enter your password',
        rememberMe: 'Remember account',
        forgotPassword: 'Forgot password?',
        loginButton: 'Sign in',
        noAccount: 'No account yet? Please contact your administrator.',
        toastSigningIn: 'Signing in...',
        toastSignedIn: 'Signed in',
        toastLoginFailed: 'Login failed',
        toastCheckingLogin: 'Checking session...',
        toastAlreadyLoggedIn: 'Already signed in. Redirecting...',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        themeDark: 'Dark theme',
        themeLight: 'Light theme',
        localeSwitcher: '中 / EN'
      }
    },
    navigation: {
      dashboard: 'Dashboard',
      scenes: 'Scenes',
      assets: 'Assets',
      settings: 'Settings'
    },
    profile: {
      profileDialogTitle: 'Profile',
      profileDialogConfirm: 'Save',
      profileDialogCancel: 'Cancel',
      profileMenuLabel: 'Profile',
      logoutMenuLabel: 'Sign out',
      nicknameLabel: 'Nickname',
      nicknamePlaceholder: 'Enter nickname',
      nicknameRequiredToast: 'Nickname is required.',
      savingToast: 'Saving...',
      savedToast: 'Saved',
      updateFailedToast: 'Update failed'
    },
    assetPane: {
      systemTab: 'System Assets',
      mineTab: 'My Assets',
      structureTab: 'Structure',
      systemPlaceholder: 'System presets will be displayed here.',
      minePlaceholder: 'Your uploaded assets will be displayed here.',
      structurePlaceholder: 'Scene structure tree will be displayed here.'
    },
    systemAssets: {
      modelsTab: 'Models',
      camerasTab: 'Cameras',
      lightsTab: 'Lights',
      materialsTab: 'Materials',
      lightNames: {
        ambientLight: 'AmbientLight',
        directionalLight: 'DirectionalLight',
        pointLight: 'PointLight',
        spotLight: 'SpotLight',
        hemisphereLight: 'HemisphereLight',
        rectAreaLight: 'RectAreaLight'
      },
      materialsPlaceholder: 'Preset materials will be displayed here.'
    },
    modelNames: {
      cube: 'Cube',
      sphere: 'Sphere',
      plane: 'Plane',
      circular: 'Circle',
      cone: 'Cone',
      cylinder: 'Cylinder',
      torus: 'Torus',
      theConduit: 'Pipe'
    },
    designPage: {
      viewport: {
        viewPresets: {
          default: 'Default view',
          front: 'Front view',
          back: 'Back view',
          left: 'Left view',
          right: 'Right view',
          top: 'Top view',
          bottom: 'Bottom view'
        },
        tools: {
          translate: 'Translate',
          zoom: 'Zoom',
          rotate: 'Rotate'
        }
      },
      inspector: {
        tabs: {
          scene: 'Scene',
          data: 'Data',
          interaction: 'Interaction'
        },
        placeholders: {
          scene: 'Scene properties will appear here.',
          data: 'Data properties will appear here.',
          interaction: 'Interaction properties will appear here.'
        },
        sceneSettings: {
          title: 'Basic Settings',
          sceneNameLabel: 'Scene Name',
          sceneNamePlaceholder: 'Enter scene name',
          descriptionLabel: 'Detailed Description',
          descriptionPlaceholder: 'Enter a detailed description',
          environmentSettings: {
            title: 'Environment Settings',
            backgroundModeLabel: 'Background Mode',
            backgroundModeOptions: {
              solid: 'Solid',
              skybox: 'Skybox'
            },
            backgroundColorLabel: 'Background Color',
            environmentHdriLabel: 'Environment HDRI',
            environmentHdriUploadLabel: 'Upload HDRI',
            environmentHdriSelectPlaceholder: 'Select/Import HDRI',
            environmentHdriPreviewLabel: 'Preview',
            environmentHdriPreviewTitle: 'Image Preview',
            environmentHdriPreviewLoading: 'Loading...',
            environmentHdriPreviewUnsupported: 'Preview not supported for this file type',
            environmentHdriPreviewError: 'Preview failed. Please try again.',
            environmentStrengthLabel: 'Environment Strength',
            fogToggleLabel: 'Global Fog (Fog)',
            fogColorLabel: 'Fog Color',
            fogNearLabel: 'Near',
            fogFarLabel: 'Far'
          },
          rendererSettings: {
            title: 'Renderer Settings',
            antialiasLabel: 'Antialias',
            outputColorSpaceLabel: 'Output Color Space',
            outputColorSpaceOptions: {
              SRGBColorSpace: 'sRGB',
              LinearSRGBColorSpace: 'Linear sRGB'
            },
            toneMappingLabel: 'Tone Mapping',
            toneMappingOptions: {
              NoToneMapping: 'None (NoToneMapping)',
              LinearToneMapping: 'Linear',
              ReinhardToneMapping: 'Reinhard',
              CineonToneMapping: 'Cineon',
              ACESFilmicToneMapping: 'ACES Filmic'
            },
            toneMappingExposureLabel: 'Exposure',
            shadowMapEnabledLabel: 'Enable Shadow Map',
            shadowMapTypeLabel: 'Shadow Type',
            shadowMapTypeOptions: {
              BasicShadowMap: 'Basic',
              PCFShadowMap: 'PCF',
              PCFSoftShadowMap: 'PCF Soft'
            },
            shadowMapAutoUpdateLabel: 'Shadow Auto Update'
          },
          cameraSettings: {
            title: 'Camera Settings',
            fovLabel: 'Field of View (FOV)',
            nearLabel: 'Near',
            farLabel: 'Far',
            positionLabel: 'Camera Position',
            targetLabel: 'Target',
            resetCameraLabel: 'Reset Camera'
          },
          helpersSettings: {
            title: 'Helpers',
            axisTitle: 'Axes Helper',
            axisEnabledLabel: 'Show axes',
            axisSizeLabel: 'Axes size'
          },
          gridSettings: {
            title: 'Grid Settings',
            enabledLabel: 'Show Grid',
            colorLabel: 'Grid Main Color',
            opacityLabel: 'Grid Opacity'
          }
        }
      }
    }
  }
};

/**
 * 兼容登录页使用的简化别名，方便直接按模块解构。
 */
export const loginMessages: Record<Locale, AppMessages['auth']['login']> = {
  'zh-CN': appMessages['zh-CN'].auth.login,
  'en-US': appMessages['en-US'].auth.login
};

