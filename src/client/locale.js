/**
 * dsh-skill-picker — UI dictionary + locale resolver.
 *
 * The picker's browser half hardcoded every UI string in Chinese. This module
 * extracts them into per-locale dictionaries and resolves the active language
 * the same way the host does: from `document.documentElement.lang` (the host
 * sets it to the active locale, e.g. `ru`). `zh` is the base/fallback, exactly
 * as before; `ru` (and `en`) are looked up when the host language matches.
 *
 * @module dsh-skill-picker/client/locale
 */

const dicts = {
  zh: {
    'group.pinned': '置顶',
    'group.recent': '最近使用',
    'group.all': '全部',
    'btn.title': '选择技能（插入 /技能名 到发送框）',
    'btn.title.local': '　·　列表来自本地扫描',
    'btn.title.slash': '　·　/ 增强：运行时接管',
    'btn.aria': '选择技能',
    'search.placeholder': '搜索技能…（↑↓ 选择，Enter 插入）',
    'status.loadFailed': '加载失败：{error}',
    'status.loading': '加载中…',
    'empty.noDisabled': '没有被关闭的技能',
    'empty.noMatchDisabled': '没有匹配的已关闭技能',
    'empty.noMatch': '没有匹配的技能',
    'notice.opFailed': '操作失败',
    'notice.uninstalled': '已卸载 /{name} —— 只是移进备份目录，没删',
    'notice.disabled': '已关闭 /{name} —— agent 也不会再加载它了',
    'notice.enabled': '已开启 /{name}',
    'notice.revealed': '已在文件管理器里定位 /{name}',
    'notice.undoFailed': '撤回失败',
    'notice.undone': '已撤回，技能回到原位置',
    'notice.undo': '撤回',
    'footer.hint.all': '右键可管理 · 手机长按',
    'footer.hint.off': '右键可开启 · 手机长按',
    'footer.title.all': '查看被关闭的技能',
    'footer.title.off': '回到全部技能',
    'footer.chip.all': '← 全部技能',
    'footer.chip.off': '已关闭 {count}',
    'menu.unpin': '取消置顶',
    'menu.pin': '置顶到顶部',
    'menu.enable': '开启',
    'menu.disable': '关闭（agent 也不再加载）',
    'menu.reveal': '在文件管理器中定位',
    'menu.uninstall.confirm': '卸载 /{name}？\n\n它会被移进备份目录（不是删除），面板里可以撤回。',
    'menu.uninstall': '卸载（移入备份，可撤回）',
  },
  en: {
    'group.pinned': 'Pinned',
    'group.recent': 'Recently used',
    'group.all': 'All',
    'btn.title': 'Select a skill (inserts /skill-name into the input box)',
    'btn.title.local': '  ·  list from local scan',
    'btn.title.slash': '  ·  / enhancement: runtime takeover',
    'btn.aria': 'Select skill',
    'search.placeholder': 'Search skills… (↑↓ to select, Enter to insert)',
    'status.loadFailed': 'Failed to load: {error}',
    'status.loading': 'Loading…',
    'empty.noDisabled': 'No disabled skills',
    'empty.noMatchDisabled': 'No matching disabled skills',
    'empty.noMatch': 'No matching skills',
    'notice.opFailed': 'Operation failed',
    'notice.uninstalled': 'Removed /{name} — moved to backup, not deleted',
    'notice.disabled': 'Disabled /{name} — the agent will no longer load it',
    'notice.enabled': 'Enabled /{name}',
    'notice.revealed': 'Revealed /{name} in the file manager',
    'notice.undoFailed': 'Undo failed',
    'notice.undone': 'Undone — the skill is back in place',
    'notice.undo': 'Undo',
    'footer.hint.all': 'Right-click to manage · long-press on mobile',
    'footer.hint.off': 'Right-click to enable · long-press on mobile',
    'footer.title.all': 'View disabled skills',
    'footer.title.off': 'Back to all skills',
    'footer.chip.all': '← All skills',
    'footer.chip.off': 'Disabled {count}',
    'menu.unpin': 'Unpin',
    'menu.pin': 'Pin to top',
    'menu.enable': 'Enable',
    'menu.disable': 'Disable (agent will no longer load it)',
    'menu.reveal': 'Reveal in file manager',
    'menu.uninstall.confirm': 'Remove /{name}?\n\nIt will be moved to the backup folder (not deleted); you can undo it in the panel.',
    'menu.uninstall': 'Remove (to backup, can undo)',
  },
  ru: {
    'group.pinned': 'Закреплённые',
    'group.recent': 'Недавние',
    'group.all': 'Все',
    'btn.title': 'Выбрать навык (вставит /имя-навыка в поле ввода)',
    'btn.title.local': '  ·  список из локального сканирования',
    'btn.title.slash': '  ·  / усиление: перехват в рантайме',
    'btn.aria': 'Выбрать навык',
    'search.placeholder': 'Поиск навыков… (↑↓ — выбор, Enter — вставить)',
    'status.loadFailed': 'Ошибка загрузки: {error}',
    'status.loading': 'Загрузка…',
    'empty.noDisabled': 'Нет отключённых навыков',
    'empty.noMatchDisabled': 'Нет подходящих отключённых навыков',
    'empty.noMatch': 'Нет подходящих навыков',
    'notice.opFailed': 'Ошибка операции',
    'notice.uninstalled': 'Убран /{name} — перенесён в резерв, не удалён',
    'notice.disabled': 'Отключён /{name} — агент больше не будет его загружать',
    'notice.enabled': 'Включён /{name}',
    'notice.revealed': 'Открыт в файловом менеджере /{name}',
    'notice.undoFailed': 'Ошибка отмены',
    'notice.undone': 'Отменено — навык вернулся на место',
    'notice.undo': 'Отменить',
    'footer.hint.all': 'ПКМ — управление · долгое нажатие на телефоне',
    'footer.hint.off': 'ПКМ — включить · долгое нажатие на телефоне',
    'footer.title.all': 'Посмотреть отключённые навыки',
    'footer.title.off': 'Назад ко всем навыкам',
    'footer.chip.all': '← Все навыки',
    'footer.chip.off': 'Отключено {count}',
    'menu.unpin': 'Убрать из закреплённых',
    'menu.pin': 'Закрепить сверху',
    'menu.enable': 'Включить',
    'menu.disable': 'Отключить (агент больше не загрузит)',
    'menu.reveal': 'Открыть в файловом менеджере',
    'menu.uninstall.confirm': 'Убрать /{name}?\n\nОн будет перенесён в резервную папку (не удалён), отменить можно в панели.',
    'menu.uninstall': 'Убрать (в резерв, можно отменить)',
  },
}

/** Resolve the active locale: ru → ru, en → en, otherwise zh (base). */
export function activeLang() {
  const lang = (document.documentElement.lang || navigator.language || '').toLowerCase()
  if (lang.startsWith('ru')) return 'ru'
  if (lang.startsWith('en')) return 'en'
  return 'zh'
}

/** Look up `key` in the active locale's dictionary, falling back to zh. */
export function t(key, params = {}) {
  const lang = activeLang()
  const dict = dicts[lang] ?? dicts.zh
  let text = dict[key] ?? dicts.zh[key] ?? key
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

export default { activeLang, t }
