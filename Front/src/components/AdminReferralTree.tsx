import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Copy, RefreshCw, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import type { AdminReferralNode } from '../lib/api';
import { useI18n } from '../i18n';

const sources = ['direct','referral_link','referral_code','admin_created','sponsored_profile','import','backfill'];
const roles = ['client','escort','business','admin','moderator'];

export function AdminReferralTree({ token }: { token: string }) {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<AdminReferralNode[]>([]);
  const [children, setChildren] = useState<Record<string, AdminReferralNode[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [source, setSource] = useState('');
  const [maxDepth, setMaxDepth] = useState(1);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const loadRoot = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ maxDepth: String(maxDepth), page: String(page), pageSize: '50' });
    if (search.trim()) params.set('search', search.trim()); if (role) params.set('role', role); if (source) params.set('registrationSource', source);
    try { const data=await api.adminReferralTree(token,params); setNodes(data.nodes); setHasMore(data.hasMore); setChildren({}); setExpanded({}); }
    catch { setError(t('referralTree.loadError')); } finally { setLoading(false); }
  }, [token,maxDepth,page,search,role,source,t]);

  useEffect(() => { void loadRoot(); }, [loadRoot]);

  async function toggle(node: AdminReferralNode) {
    if (expanded[node.userId]) return setExpanded(value=>({...value,[node.userId]:false}));
    if (!children[node.userId] && node.directChildrenCount) {
      const params=new URLSearchParams({parentUserId:node.userId,maxDepth:'1',page:'1',pageSize:'100'});
      try { const data=await api.adminReferralTree(token,params); setChildren(value=>({...value,[node.userId]:data.nodes.filter(child=>child.userId!==node.userId)})); }
      catch { return setError(t('referralTree.loadError')); }
    }
    setExpanded(value=>({...value,[node.userId]:true}));
  }

  function renderNode(node: AdminReferralNode, indent=0) {
    const open=expanded[node.userId];
    const sourceLabel=t(`referralTree.source.${node.registrationSource}`);
    const activationLabel=node.activationProvider==='stripe'&&node.activationStatus==='client_activated'
      ? t('referralTree.stripeActivated')
      : node.activationStatus==='client_activated' ? t('referralTree.manuallyActivated') : null;
    return <div className="referral-tree-branch" key={`${node.userId}-${indent}`}>
      <article className={`referral-tree-node ${node.referralDepth===0?'root':''}`} style={{'--tree-indent':indent} as CSSProperties}>
        <button className="referral-tree-toggle" disabled={!node.directChildrenCount} onClick={()=>toggle(node)} aria-label={open?t('referralTree.hideChildren'):t('referralTree.showChildren')}>{open?<ChevronDown/>:<ChevronRight/>}</button>
        <UserRound className="referral-tree-avatar" />
        <div className="referral-tree-main"><strong>{node.displayName}</strong><span>{t('referralTree.level')} {node.referralDepth} · {node.role} · {node.accountStatus}</span><small>{new Date(node.createdAt).toLocaleDateString()}</small><div className="referral-tree-badges"><span>{sourceLabel}</span>{node.isRoot&&<span>{t('referralTree.rootBadge')}</span>}{node.isSponsoredProfile&&<span>{t('referralTree.sponsoredBadge')}</span>}{node.role==='client'&&<span>{t('referralTree.clientBadge')}</span>}{activationLabel&&<span>{activationLabel}</span>}</div></div>
        <div className="referral-tree-stats"><span>{t('referralTree.directChildren')}: {node.directChildrenCount}</span><span>{t('referralTree.descendants')}: {node.totalDescendantsCount}</span><span>{t('referralTree.balance')}: {(node.balanceBcu/10000).toLocaleString()}</span></div>
        <button className="button" onClick={()=>navigator.clipboard?.writeText(node.referralCode)}><Copy size={14}/>{node.referralCode}</button>
      </article>
      {open && (children[node.userId]||[]).map(child=>renderNode(child,indent+1))}
    </div>;
  }

  return <section className="admin-referral-tree">
    <div className="referral-tree-toolbar">
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('admin.filters.searchRecords')}/>
      <select value={role} onChange={e=>setRole(e.target.value)} aria-label={t('referralTree.roleFilter')}><option value="">{t('referralTree.all')}</option>{roles.map(x=><option key={x}>{x}</option>)}</select>
      <select value={source} onChange={e=>setSource(e.target.value)} aria-label={t('referralTree.sourceFilter')}><option value="">{t('referralTree.all')}</option>{sources.map(x=><option key={x} value={x}>{t(`referralTree.source.${x}`)}</option>)}</select>
      <select value={maxDepth} onChange={e=>setMaxDepth(Number(e.target.value))} aria-label={t('referralTree.level')}>{[0,1,2,3,4,5].map(x=><option key={x} value={x}>{t('referralTree.level')} {x}</option>)}</select>
      <button className="button" onClick={loadRoot}><RefreshCw size={15}/>{t('referralTree.retry')}</button>
    </div>
    {loading&&<p>{t('states.loading')}</p>}{error&&<div className="admin-alert">{error}<button className="button" onClick={loadRoot}>{t('referralTree.retry')}</button></div>}
    {!loading&&!error&&!nodes.length&&<p>{t('referralTree.empty')}</p>}
    <div className="referral-tree-list">{nodes.map(node=>renderNode(node))}</div>
    <div className="referral-tree-pagination"><button className="button" disabled={page<=1} onClick={()=>setPage(x=>x-1)}>{t('referralTree.previous')}</button><span>{page}</span><button className="button" disabled={!hasMore} onClick={()=>setPage(x=>x+1)}>{t('referralTree.next')}</button></div>
  </section>;
}
