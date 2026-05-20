import { useParams } from 'react-router-dom';
import { useI18n } from '../i18n';

export function LegalPage() {
  const { page = 'terms' } = useParams();
  const { t } = useI18n();
  const title = t(`legal.title.${page}`);

  return (
    <div className="page narrow">
      <section className="legal-panel">
        <p className="eyebrow">{t('legal.eyebrow')}</p>
        <h1>{title}</h1>
        <p>{t('legal.copy1')}</p>
        <p>{t('legal.copy2')}</p>
      </section>
    </div>
  );
}
