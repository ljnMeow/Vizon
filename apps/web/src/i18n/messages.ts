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
    loading: string;
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
    nicknameFallback: string;
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
    structureEmpty: string;
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
    cameraNames: {
      orthographic: string;
      perspective: string;
    };
    modelList: {
      basicHeader: string;
      environmentHeader: string;
      charactersHeader: string;
      emptyBasic: string;
      emptyEnvironment: string;
      emptyCharacters: string;
    };
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
        properties: string;
        materials: string;
        effects: string;
      };
      placeholders: {
        scene: string;
        data: string;
        interaction: string;
        properties: string;
        materials: string;
        effects: string;
      };
      propertiesSettings: {
        baseSettingTitle: string;
        typeLabel: string;
        nameLabel: string;
        namePlaceholder: string;
        uuidLabel: string;
        copyLabel: string;
        copiedLabel: string;
        copyFailedLabel: string;
        positionLabel: string;
        rotationLabel: string;
        scaleLabel: string;
        castShadowLabel: string;
        receiveShadowLabel: string;
        frustumCulledLabel: string;
        shadowTitleLabel: string;
        yesLabel: string;
        noLabel: string;
        visibleLabel: string;
        pickableLabel: string;
        freezeLabel: string;
        opacityLabel: string;
        renderOrderLabel: string;
        xLabel: string;
        yLabel: string;
        zLabel: string;
      };
      objectAttributes: {
        header: string;
        modelTypeLabel: string;
        geometryTypeLabel: string;
        notDefaultText: string;
        conduitEditToggleLabel: string;
        yesLabel: string;
        noLabel: string;
        models: {
          cubeTitle: string;
          sphereTitle: string;
          planeTitle: string;
          circularTitle: string;
          coneTitle: string;
          cylinderTitle: string;
          torusTitle: string;
          theConduitTitle: string;
          groupTitle: string;
        };
        attributes: {
          cube: {
            widthLabel: string;
            heightLabel: string;
            depthLabel: string;
          };
          sphere: {
            radiusLabel: string;
            widthSegmentsLabel: string;
            heightSegmentsLabel: string;
          };
          plane: {
            widthLabel: string;
            heightLabel: string;
          };
          circular: {
            radiusLabel: string;
            segmentsLabel: string;
          };
          cone: {
            radiusLabel: string;
            heightLabel: string;
            radialSegmentsLabel: string;
            heightSegmentsLabel: string;
          };
          cylinder: {
            radiusTopLabel: string;
            radiusBottomLabel: string;
            heightLabel: string;
            radialSegmentsLabel: string;
            heightSegmentsLabel: string;
          };
          torus: {
            radiusLabel: string;
            tubeLabel: string;
            radialSegmentsLabel: string;
            tubularSegmentsLabel: string;
            arcLabel: string;
          };
          theConduit: {
            pathControlPointsLabel: string;
            tubularSegmentsLabel: string;
            radiusLabel: string;
            radialSegmentsLabel: string;
            closedLabel: string;
          };
        };
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
      processing: '处理中...',
      loading: '加载中...'
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
      nicknameFallback: '用户',
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
      structurePlaceholder: '场景结构树将在这里展示。',
      structureEmpty: '场景树为空'
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
      materialsPlaceholder: '预设材质将在这里展示。',
      cameraNames: {
        orthographic: '正交相机',
        perspective: '透视相机'
      },
      modelList: {
        basicHeader: '基础几何体',
        environmentHeader: '环境',
        charactersHeader: '角色',
        emptyBasic: '暂无模型数据',
        emptyEnvironment: '暂无环境模型',
        emptyCharacters: '暂无角色模型'
      }
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
          interaction: '交互',
          properties: '属性',
          materials: '材质',
          effects: '特效'
        },
        placeholders: {
          scene: '这里将来是场景属性（Scene）',
          data: '这里将来是数据属性（Data）',
          interaction: '这里将来是交互属性（Interaction）',
          properties: '这里将来是属性（Properties）',
          materials: '这里将来是材质（Materials）',
          effects: '这里将来是特效（Effects）'
        },
        propertiesSettings: {
          baseSettingTitle: '通用属性',
          typeLabel: '类型',
          nameLabel: '名称',
          namePlaceholder: '请输入名称',
          uuidLabel: 'UUID',
          copyLabel: '复制',
          copiedLabel: '已复制',
          copyFailedLabel: '复制失败，请重试',
          positionLabel: '位置',
          rotationLabel: '旋转',
          scaleLabel: '缩放',
          castShadowLabel: '产生阴影',
          receiveShadowLabel: '接受阴影',
          frustumCulledLabel: '视锥体裁剪',
          shadowTitleLabel: '阴影',
          yesLabel: '是',
          noLabel: '否',
          visibleLabel: '显示',
          pickableLabel: '可拾取',
          freezeLabel: '冻结',
          opacityLabel: '透明度',
          renderOrderLabel: '渲染层级',
          xLabel: 'X',
          yLabel: 'Y',
          zLabel: 'Z'
        },
        objectAttributes: {
          header: '对象属性',
          modelTypeLabel: '模型类型',
          geometryTypeLabel: '几何体',
          notDefaultText: '当前选择不是内置默认几何体（无法读取其自身特殊属性）。',
          conduitEditToggleLabel: '管道编辑模式',
          yesLabel: '是',
          noLabel: '否',
          models: {
            cubeTitle: '立方体',
            sphereTitle: '球体',
            planeTitle: '平面',
            circularTitle: '圆形',
            coneTitle: '圆锥',
            cylinderTitle: '圆柱',
            torusTitle: '圆环',
            theConduitTitle: '管道',
            groupTitle: '集合体'
          },
          attributes: {
            cube: {
              widthLabel: '宽度',
              heightLabel: '高度',
              depthLabel: '深度'
            },
            sphere: {
              radiusLabel: '半径',
              widthSegmentsLabel: '宽分段',
              heightSegmentsLabel: '高分段'
            },
            plane: {
              widthLabel: '宽度',
              heightLabel: '高度'
            },
            circular: {
              radiusLabel: '半径',
              segmentsLabel: '分段'
            },
            cone: {
              radiusLabel: '底面半径',
              heightLabel: '高度',
              radialSegmentsLabel: '径向分段',
              heightSegmentsLabel: '高度分段'
            },
            cylinder: {
              radiusTopLabel: '上半径',
              radiusBottomLabel: '下半径',
              heightLabel: '高度',
              radialSegmentsLabel: '径向分段',
              heightSegmentsLabel: '高度分段'
            },
            torus: {
              radiusLabel: '主半径',
              tubeLabel: '管半径',
              radialSegmentsLabel: '径向分段',
              tubularSegmentsLabel: '管道分段',
              arcLabel: '弧长'
            },
            theConduit: {
              pathControlPointsLabel: '路径控制点数',
              tubularSegmentsLabel: '管道分段',
              radiusLabel: '半径',
              radialSegmentsLabel: '径向分段',
              closedLabel: '是否闭合'
            }
          }
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
      processing: 'Processing...',
      loading: 'Loading...'
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
      nicknameFallback: 'User',
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
      structurePlaceholder: 'Scene structure tree will be displayed here.',
      structureEmpty: 'Scene tree is empty'
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
      materialsPlaceholder: 'Preset materials will be displayed here.',
      cameraNames: {
        orthographic: 'Orthographic Camera',
        perspective: 'Perspective Camera'
      },
      modelList: {
        basicHeader: 'Basic Geometry',
        environmentHeader: 'Environment',
        charactersHeader: 'Characters',
        emptyBasic: 'No model data',
        emptyEnvironment: 'No environment models',
        emptyCharacters: 'No character models'
      }
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
          interaction: 'Interaction',
          properties: 'Properties',
          materials: 'Materials',
          effects: 'Effects'
        },
        placeholders: {
          scene: 'Scene properties will appear here.',
          data: 'Data properties will appear here.',
          interaction: 'Interaction properties will appear here.',
          properties: 'Properties will appear here.',
          materials: 'Materials will appear here.',
          effects: 'Effects will appear here.'
        },
        propertiesSettings: {
          baseSettingTitle: 'Common Properties',
          typeLabel: 'Type',
          nameLabel: 'Name',
          namePlaceholder: 'Enter name',
          uuidLabel: 'UUID',
          copyLabel: 'Copy',
          copiedLabel: 'Copied',
          copyFailedLabel: 'Copy failed. Please try again.',
          positionLabel: 'Position',
          rotationLabel: 'Rotation',
          scaleLabel: 'Scale',
          castShadowLabel: 'Cast Shadow',
          receiveShadowLabel: 'Receive Shadow',
          frustumCulledLabel: 'Frustum Culling',
          shadowTitleLabel: 'Shadow',
          yesLabel: 'Yes',
          noLabel: 'No',
          visibleLabel: 'Visible',
          pickableLabel: 'Pickable',
          freezeLabel: 'Freeze',
          opacityLabel: 'Opacity',
          renderOrderLabel: 'Render Order',
          xLabel: 'X',
          yLabel: 'Y',
          zLabel: 'Z'
        },
        objectAttributes: {
          header: 'Object Attributes',
          modelTypeLabel: 'Model Type',
          geometryTypeLabel: 'Geometry',
          notDefaultText: 'The current selection is not a built-in default geometry (its special parameters cannot be read).',
          conduitEditToggleLabel: 'Conduit edit mode',
          yesLabel: 'Yes',
          noLabel: 'No',
          models: {
            cubeTitle: 'Cube',
            sphereTitle: 'Sphere',
            planeTitle: 'Plane',
            circularTitle: 'Circle',
            coneTitle: 'Cone',
            cylinderTitle: 'Cylinder',
            torusTitle: 'Torus',
            theConduitTitle: 'Conduit',
            groupTitle: 'Group'
          },
          attributes: {
            cube: {
              widthLabel: 'Width',
              heightLabel: 'Height',
              depthLabel: 'Depth'
            },
            sphere: {
              radiusLabel: 'Radius',
              widthSegmentsLabel: 'Width Segments',
              heightSegmentsLabel: 'Height Segments'
            },
            plane: {
              widthLabel: 'Width',
              heightLabel: 'Height'
            },
            circular: {
              radiusLabel: 'Radius',
              segmentsLabel: 'Segments'
            },
            cone: {
              radiusLabel: 'Radius',
              heightLabel: 'Height',
              radialSegmentsLabel: 'Radial Segments',
              heightSegmentsLabel: 'Height Segments'
            },
            cylinder: {
              radiusTopLabel: 'Top Radius',
              radiusBottomLabel: 'Bottom Radius',
              heightLabel: 'Height',
              radialSegmentsLabel: 'Radial Segments',
              heightSegmentsLabel: 'Height Segments'
            },
            torus: {
              radiusLabel: 'Radius',
              tubeLabel: 'Tube',
              radialSegmentsLabel: 'Radial Segments',
              tubularSegmentsLabel: 'Tubular Segments',
              arcLabel: 'Arc'
            },
            theConduit: {
              pathControlPointsLabel: 'Control Points',
              tubularSegmentsLabel: 'Tubular Segments',
              radiusLabel: 'Radius',
              radialSegmentsLabel: 'Radial Segments',
              closedLabel: 'Closed'
            }
          }
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

