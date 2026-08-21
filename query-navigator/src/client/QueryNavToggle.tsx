import { useSyncExternalStore, useEffect } from 'react'
import { isNavEnabled, setNavEnabled, subscribeNav } from './nav-store.ts'

const toggleStylesheet = `
.dsh-query-nav-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-line-strong, rgba(128, 128, 128, .35));
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.dsh-query-nav-toggle[data-nav-state='on'] {
  border-color: var(--dsw-alias-primary-default, currentColor);
  color: var(--dsw-alias-primary-default, currentColor);
}
`

export function QueryNavToggle() {
  const enabled = useSyncExternalStore(subscribeNav, isNavEnabled)

  useEffect(() => {
    const styleId = 'dsh-query-nav-toggle-style'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = toggleStylesheet
      document.head.appendChild(style)
    }
  }, [])

  return (
    <button
      type="button"
      className="dsh-query-nav-toggle"
      data-nav-state={enabled ? 'on' : 'off'}
      aria-label="切换右侧查询导航栏"
      title={enabled ? '导航: 开启' : '导航: 关闭'}
      onClick={() => setNavEnabled(!enabled)}
    >
      {enabled ? '导航开启' : '导航关闭'}
    </button>
  )
}
