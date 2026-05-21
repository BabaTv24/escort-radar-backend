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
        <div className="legal-ownership">
          <p className="eyebrow">{t('legal.technologyTitle')}</p>
          <h2>{t('baba.powered')}</h2>
          <p>{t('legal.technologyCopy1')}</p>
          <p>{t('legal.technologyCopy2')}</p>
          <p>{t('legal.technologyCopy3')}</p>
          <a href="https://www.baba-ai.de" target="_blank" rel="noreferrer">baba-ai.de</a>
        </div>
      </section>
    </div>
  );
}
