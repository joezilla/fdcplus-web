<script lang="ts">
  import Toast from '$lib/components/shared/Toast.svelte';
  import TopBar from '$lib/components/shell/TopBar.svelte';
  import Sidebar from '$lib/components/shell/Sidebar.svelte';
  import AuthGate from '$lib/components/shell/AuthGate.svelte';
  import TerminalPage from '$lib/pages/TerminalPage.svelte';
  import DisksPage from '$lib/pages/DisksPage.svelte';
  import DrivesPage from '$lib/pages/DrivesPage.svelte';
  import ClientsPage from '$lib/pages/ClientsPage.svelte';
  import CassettesPage from '$lib/pages/CassettesPage.svelte';
  import CatalogPage from '$lib/pages/CatalogPage.svelte';
  import ProfilesPage from '$lib/pages/ProfilesPage.svelte';
  import MachinesPage from '$lib/pages/MachinesPage.svelte';
  import ScriptsPage from '$lib/pages/ScriptsPage.svelte';
  import ConfigPage from '$lib/pages/ConfigPage.svelte';
  import ChatPanel from '$lib/components/chat/ChatPanel.svelte';

  // Initialize socket connection (side effect on import)
  import '$lib/services/socket';
  // Initialize theme store (side effect: applies <html data-theme>)
  import '$lib/stores/theme';
  // Route store (side effect on import: parses location.hash, canonicalizes it,
  // and starts listening for Back/Forward). Imported at module scope, so the
  // deep link is captured before AuthGate finishes probing and before any page
  // mounts — it is simply applied late.
  import { route, navigate, type PageId } from '$lib/stores/route';
  import { anyDirty } from '$lib/stores/configDirty';

  function isNarrowNow(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
  }

  const currentPage = $derived($route.page);
  let sidebarOpen = $state(!isNarrowNow());
  let chatOpen = $state(false);

  function navigateTo(page: PageId): void {
    navigate({ page });
  }

  // Close the mobile drawer on ANY page change — including Back/Forward and a
  // cold deep link, which navigateTo() never sees. (This used to live inside
  // navigateTo, so it only fired for in-app clicks.)
  $effect(() => {
    $route.page;
    if (isNarrowNow()) sidebarOpen = false;
  });

  // Warn before losing unsaved Config edits. This covers reload, tab close and
  // typing a new URL — but NOT the in-app Back button: `popstate` is not
  // cancellable, so leaving a dirty Config page via Back still discards edits
  // silently. The only workaround (a sentinel history entry re-pushed on
  // popstate) breaks Forward and confuses screen readers, so it is deliberately
  // not done here.
  $effect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (anyDirty()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  });
</script>

<AuthGate>
<div
  class="fdc-root"
  style="
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    overflow: hidden;
  "
>
  <TopBar
    {chatOpen}
    {sidebarOpen}
    onToggleChat={() => (chatOpen = !chatOpen)}
    onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
  />

  <div style="flex: 1; display: flex; min-height: 0; position: relative;">
    {#if sidebarOpen}
      <!-- Desktop: inline flex sibling -->
      <div class="hidden lg:flex" style="flex: 0 0 272px;">
        <Sidebar active={currentPage} onNavigate={navigateTo} />
      </div>

      <!-- Mobile: overlay drawer with backdrop -->
      <div
        class="lg:hidden"
        role="presentation"
        onclick={() => (sidebarOpen = false)}
        style="position: fixed; inset: 56px 0 0 0; z-index: 40; background: var(--surface-overlay);"
      >
        <div
          role="presentation"
          onclick={(e) => e.stopPropagation()}
          style="position: absolute; left: 0; top: 0; bottom: 0; box-shadow: var(--elev-3);"
        >
          <Sidebar active={currentPage} onNavigate={navigateTo} />
        </div>
      </div>
    {/if}

    <main
      id="main"
      aria-label="Main content"
      style="
        flex: 1;
        min-width: 0;
        overflow: auto;
        background: var(--bg);
        display: flex;
        flex-direction: column;
      "
    >
      {#if currentPage === 'terminal'}
        <TerminalPage />
      {:else if currentPage === 'disks'}
        <DisksPage onNavigate={navigateTo} />
      {:else if currentPage === 'drives'}
        <DrivesPage />
      {:else if currentPage === 'clients'}
        <ClientsPage onNavigate={navigateTo} />
      {:else if currentPage === 'cassettes'}
        <CassettesPage />
      {:else if currentPage === 'catalog'}
        <CatalogPage />
      {:else if currentPage === 'profiles'}
        <ProfilesPage />
      {:else if currentPage === 'machines'}
        <MachinesPage onNavigate={navigateTo} />
      {:else if currentPage === 'scripts'}
        <ScriptsPage />
      {:else if currentPage === 'config'}
        <ConfigPage />
      {/if}
    </main>
  </div>
</div>

<ChatPanel open={chatOpen} onclose={() => (chatOpen = false)} />
</AuthGate>
<Toast />
