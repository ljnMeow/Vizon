import { Accordion, type AccordionItem } from '../../../../components/Accordion';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import { SceneSettingsBasicItem, type SceneSettingsBasicLabels } from './SceneSettingsBasicItem';
import { SceneSettingsCameraItem, type SceneSettingsCameraLabels } from './SceneSettingsCameraItem';
import {
  SceneSettingsHelpersItem,
  type SceneSettingsGridLabels,
  type SceneSettingsHelpersLabels
} from './SceneSettingsHelpersItem';
import { SceneSettingsEnvironmentItem, type SceneSettingsEnvironmentLabels } from './SceneSettingsEnvironmentItem';
import { SceneSettingsRendererItem, type SceneSettingsRendererLabels } from './SceneSettingsRendererItem';

type SceneSettingsAccordionKey = 'basic' | 'environment' | 'renderer' | 'camera' | 'helpers';

export function SceneSettings() {
  const { locale } = useLocale();
  const t = appMessages[locale].designPage.inspector.sceneSettings as typeof appMessages['zh-CN']['designPage']['inspector']['sceneSettings'];
  const c = appMessages[locale].common;

  const env = t.environmentSettings;
  const renderer = t.rendererSettings;
  const camera = t.cameraSettings;
  const grid = t.gridSettings;

  const basicLabels: SceneSettingsBasicLabels = {
    title: t.title,
    sceneNameLabel: t.sceneNameLabel,
    sceneNamePlaceholder: t.sceneNamePlaceholder,
    descriptionLabel: t.descriptionLabel,
    descriptionPlaceholder: t.descriptionPlaceholder
  };

  const environmentLabels: SceneSettingsEnvironmentLabels = {
    title: env.title,
    backgroundModeLabel: env.backgroundModeLabel,
    backgroundModeOptions: env.backgroundModeOptions,
    backgroundColorLabel: env.backgroundColorLabel,
    environmentHdriLabel: env.environmentHdriLabel,
    environmentHdriSelectPlaceholder: env.environmentHdriSelectPlaceholder,
    environmentHdriUploadLabel: env.environmentHdriUploadLabel,
    environmentStrengthLabel: env.environmentStrengthLabel,
    fogToggleLabel: env.fogToggleLabel,
    fogColorLabel: env.fogColorLabel,
    fogNearLabel: env.fogNearLabel,
    fogFarLabel: env.fogFarLabel,
    environmentHdriPreviewTitle: env.environmentHdriPreviewTitle,
    environmentHdriPreviewLoading: env.environmentHdriPreviewLoading,
    environmentHdriPreviewError: env.environmentHdriPreviewError,
    environmentHdriPreviewUnsupported: env.environmentHdriPreviewUnsupported
  };

  const rendererLabels: SceneSettingsRendererLabels = {
    title: renderer.title,
    antialiasLabel: renderer.antialiasLabel,
    outputColorSpaceLabel: renderer.outputColorSpaceLabel,
    outputColorSpaceOptions: renderer.outputColorSpaceOptions,
    toneMappingLabel: renderer.toneMappingLabel,
    toneMappingOptions: renderer.toneMappingOptions,
    toneMappingExposureLabel: renderer.toneMappingExposureLabel,
    shadowMapEnabledLabel: renderer.shadowMapEnabledLabel,
    shadowMapTypeLabel: renderer.shadowMapTypeLabel,
    shadowMapTypeOptions: renderer.shadowMapTypeOptions,
    shadowMapAutoUpdateLabel: renderer.shadowMapAutoUpdateLabel
  };

  const cameraLabels: SceneSettingsCameraLabels = {
    title: camera.title,
    fovLabel: camera.fovLabel,
    nearLabel: camera.nearLabel,
    farLabel: camera.farLabel,
    positionLabel: camera.positionLabel,
    targetLabel: camera.targetLabel,
    resetCameraLabel: camera.resetCameraLabel
  };

  const gridLabels: SceneSettingsGridLabels = {
    title: grid.title,
    enabledLabel: grid.enabledLabel,
    colorLabel: grid.colorLabel,
    opacityLabel: grid.opacityLabel
  };

  const helpersLabels: SceneSettingsHelpersLabels = {
    title: t.helpersSettings.title,
    axisTitle: t.helpersSettings.axisTitle,
    axisEnabledLabel: t.helpersSettings.axisEnabledLabel,
    axisSizeLabel: t.helpersSettings.axisSizeLabel
  };

  return (
    <Accordion<SceneSettingsAccordionKey>
      allowMultiple={true}
      defaultOpenKeys={['basic', 'environment', 'renderer', 'camera', 'helpers']}
      items={[
        {
          key: 'basic',
          header: basicLabels.title,
          content: <SceneSettingsBasicItem labels={basicLabels} />
        } satisfies AccordionItem<'basic'>,
        {
          key: 'environment',
          header: environmentLabels.title,
          content: <SceneSettingsEnvironmentItem env={environmentLabels} cancelText={c.cancel} />
        } satisfies AccordionItem<'environment'>,
        {
          key: 'renderer',
          header: rendererLabels.title,
          content: <SceneSettingsRendererItem labels={rendererLabels} />
        } satisfies AccordionItem<'renderer'>,
        {
          key: 'camera',
          header: cameraLabels.title,
          content: <SceneSettingsCameraItem labels={cameraLabels} />
        } satisfies AccordionItem<'camera'>,
        {
          key: 'helpers',
          header: helpersLabels.title,
          content: <SceneSettingsHelpersItem labels={helpersLabels} gridLabels={gridLabels} />
        } satisfies AccordionItem<'helpers'>
      ]}
    />
  );
}

