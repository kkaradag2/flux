import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiResult, Project } from '../../shared/project-api';

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
const message = (error: unknown): string => error instanceof Error ? error.message : 'The project could not be loaded.';

async function loadBranches(project: Project): Promise<{ project: Project; branches: string[] }> {
  const [branchResult, currentResult] = await Promise.all([
    window.flux.getGitBranches(project.path),
    window.flux.getCurrentBranch(project.path),
  ]);
  const branches = unwrap(branchResult);
  const current = unwrap(currentResult);
  const selectedBranch = branches.includes(project.selectedBranch) ? project.selectedBranch
    : current && branches.includes(current) ? current : branches[0];
  if (!selectedBranch) throw new Error('No local branches were found in this repository.');
  return { project: { ...project, selectedBranch }, branches };
}

export function useProjectWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(true);
  const mounted = useRef(false);

  useEffect(() => {
    let alive = true;
    mounted.current = true;
    void (async () => {
      try {
        const saved = unwrap(await window.flux.getProjects());
        if (!alive) return;
        setProjects(saved);
        const first = saved[0];
        if (first) {
          setActiveProject({ ...first, selectedBranch: '' });
          const loaded = await loadBranches(first);
          if (!alive) return;
          setActiveProject(loaded.project);
          setBranches(loaded.branches);
        }
      } catch (cause) { if (alive) setError(message(cause)); }
      finally { if (alive) { busy.current = false; setLoading(false); } }
    })();
    return () => { alive = false; mounted.current = false; };
  }, []);

  const run = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(null);
    try { await operation(); }
    catch (cause) { if (mounted.current) setError(message(cause)); }
    finally { busy.current = false; if (mounted.current) setLoading(false); }
  }, []);

  const activate = useCallback(async (project: Project): Promise<void> => {
    const loaded = await loadBranches(project);
    const selected = unwrap(await window.flux.selectWorkspace(project.id, loaded.project.selectedBranch));
    const saved = unwrap(await window.flux.getProjects());
    if (!mounted.current) return;
    setProjects(saved); setActiveProject(selected); setBranches(loaded.branches);
  }, []);

  const selectProject = useCallback((id: string): Promise<void> => run(async () => {
    const project = projects.find(item => item.id === id);
    if (!project) throw new Error('The selected project is no longer registered.');
    await activate(project);
  }), [projects, run, activate]);

  const addProject = useCallback((): Promise<void> => run(async () => {
    const directory = unwrap(await window.flux.selectProjectDirectory());
    if (!directory || !mounted.current) return;
    const added = unwrap(await window.flux.addProject(directory));
    // Keep a successful registration visible even if Git changes before activation.
    const saved = unwrap(await window.flux.getProjects());
    if (mounted.current) setProjects(saved);
    await activate(added);
  }), [run, activate]);

  const selectBranch = useCallback((branch: string): Promise<void> => run(async () => {
    if (!activeProject) throw new Error('Select a project first.');
    const selected = unwrap(await window.flux.selectWorkspace(activeProject.id, branch));
    if (!mounted.current) return;
    setActiveProject(selected);
    setProjects(current => current.map(item => item.id === selected.id ? selected : item));
  }), [activeProject, run]);

  const activateConversation = useCallback(async (id: string, branch: string, isCurrent: () => boolean): Promise<boolean> => {
    let activated = false;
    await run(async () => {
      const project = projects.find(item => item.id === id);
      if (!project) throw new Error('This conversation project is no longer registered.');
      // Load only the explicitly selected conversation's registered project.
      const local = unwrap(await window.flux.getGitBranches(project.path));
      if (!mounted.current || !isCurrent()) return;
      setActiveProject({ ...project, selectedBranch: branch }); setBranches(local); activated = true;
    });
    return activated;
  }, [projects, run]);
  return { projects, activeProject, branches, loading, error, selectProject, addProject, selectBranch, activateConversation };
}
