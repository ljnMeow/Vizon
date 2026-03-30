import { Accordion, type AccordionItem } from '../../../../components/Accordion';
import { useLocale } from '../../../../hooks/useLocale';
import { appMessages } from '../../../../i18n/messages';
import { MaterialBaseSetting } from './BaseSetting';

type MaterialAccordionKey = 'base';

export function MaterialSettings() {
  const { locale } = useLocale();
  const t = appMessages[locale].designPage.inspector;

  const items: AccordionItem<MaterialAccordionKey>[] = [
    {
      key: 'base',
      header: t.propertiesSettings.baseSettingTitle,
      content: <MaterialBaseSetting />
    }
  ];

  return (
    <Accordion<MaterialAccordionKey>
      allowMultiple={false}
      defaultOpenKeys="base"
      items={items}
    />
  );
}

