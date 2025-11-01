import type { IncomingHttpHeaders } from 'http';

/**
 * Servicio para interactuar con la API de GitHub.
 * Maneja autenticación, webhooks y creación/actualización de tarjetas.
 */

// Validation: only allow names that match official GitHub rules (alphanumeric, hyphen, underscore, dot, no spaces)
function isValidGitHubOwnerOrRepo(s: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(s) && s.length <= 100;
}

export interface GitHubRepo {
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  html_url: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  url: string;
  html_url: string;
  branch?: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  head: {
    ref: string; // branch name
    sha: string;
  };
  base: {
    ref: string; // target branch
  };
  user: {
    login: string;
    avatar_url: string;
  };
  html_url: string;
  merged_at: string | null;
}

export interface GitHubCIStatus {
  state: 'pending' | 'success' | 'failure' | 'error' | 'cancelled';
  context: string;
  description: string;
  target_url: string | null;
}

/**
 * Verifica la firma del webhook de GitHub usando el secreto.
 */
export function verifyGitHubWebhook(
  payload: string | Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = 'sha256=' + hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Obtiene información del usuario autenticado en GitHub.
 */
export async function getGitHubUser(accessToken: string): Promise<{ login: string; avatar_url: string } | null> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'TaskForge/1.0'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json() as any;
    return {
      login: data.login,
      avatar_url: data.avatar_url
    };
  } catch (error) {
    console.error('Error obteniendo usuario de GitHub:', error);
    return null;
  }
}

/**
 * Lista los repositorios del usuario autenticado (propios, colaboraciones y organizaciones).
 */
export async function getGitHubUserRepos(
  accessToken: string,
  type: 'all' | 'owner' | 'member' = 'all'
): Promise<GitHubRepo[]> {
  try {
    const repos: GitHubRepo[] = [];
    let page = 1;
    const perPage = 100;
    
    while (true) {
      const response = await fetch(`https://api.github.com/user/repos?type=${type}&per_page=${perPage}&page=${page}&sort=updated&direction=desc`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'TaskForge/1.0'
        }
      });
      
      if (!response.ok) break;
      
      const data = await response.json() as any[];
      if (data.length === 0) break;
      
      for (const repo of data) {
        repos.push({
          owner: repo.owner.login,
          name: repo.name,
          full_name: repo.full_name,
          default_branch: repo.default_branch,
          html_url: repo.html_url
        });
      }
      
      if (data.length < perPage) break;
      page++;
    }
    
    return repos.sort((a, b) => a.full_name.localeCompare(b.full_name));
  } catch (error) {
    console.error('Error obteniendo repositorios de GitHub:', error);
    return [];
  }
}

/**
 * Obtiene información de un repositorio de GitHub.
 */
export async function getGitHubRepo(
  owner: string,
  repo: string,
  accessToken: string
): Promise<GitHubRepo | null> {
  if (!isValidGitHubOwnerOrRepo(owner) || !isValidGitHubOwnerOrRepo(repo)) {
    console.error(`Invalid GitHub owner or repo: owner="${owner}", repo="${repo}"`);
    return null;
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'TaskForge/1.0'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Error obteniendo repo de GitHub:', response.status, errorData);
      return null;
    }
    
    const data = await response.json() as any;
    return {
      owner: data.owner.login,
      name: data.name,
      full_name: data.full_name,
      default_branch: data.default_branch,
      html_url: data.html_url
    };
  } catch (error) {
    console.error('Error obteniendo repo de GitHub:', error);
    return null;
  }
}

/**
 * Crea un webhook en GitHub para el repositorio.
 * Retorna el webhook creado o un error detallado.
 */
export async function createGitHubWebhook(
  owner: string,
  repo: string,
  webhookUrl: string,
  webhookSecret: string,
  accessToken: string
): Promise<{ id: number; url: string } | { error: string; details?: any }> {
  if (!isValidGitHubOwnerOrRepo(owner) || !isValidGitHubOwnerOrRepo(repo)) {
    return { error: `Invalid owner or repo name: owner="${owner}", repo="${repo}"` };
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'TaskForge/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push', 'pull_request', 'status', 'create'], // Commits, PRs, CI/CD status, branches
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: webhookSecret,
          insecure_ssl: '0'
        }
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      const statusText = response.statusText;
      const status = response.status;
      
      console.error('Error creando webhook de GitHub:', {
        status,
        statusText,
        error: errorData,
        owner,
        repo,
        webhookUrl
      });

      // Mensajes de error más descriptivos según el código de estado
      let errorMessage = 'No se pudo crear el webhook';
      if (status === 401 || status === 403) {
        errorMessage = 'Permisos insuficientes. El token necesita permisos de administrador (admin:repo_hook)';
      } else if (status === 404) {
        errorMessage = 'Repositorio no encontrado o sin acceso';
      } else if (status === 422) {
        errorMessage = errorData.message || 'URL del webhook inválida o webhook duplicado';
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        errorMessage = errorData.errors.map((e: any) => e.message).join(', ');
      }

      return { error: errorMessage, details: errorData };
    }
    
    const data = await response.json() as any;
    return {
      id: data.id,
      url: data.url
    };
  } catch (error: any) {
    console.error('Error creando webhook de GitHub:', error);
    return { 
      error: error.message || 'Error de red al crear el webhook. Verifica tu conexión e intenta nuevamente.',
      details: error 
    };
  }
}

/**
 * Elimina un webhook de GitHub.
 */
export async function deleteGitHubWebhook(
  owner: string,
  repo: string,
  webhookId: number,
  accessToken: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'TaskForge/1.0'
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error eliminando webhook de GitHub:', error);
    return false;
  }
}

/**
 * Obtiene la lista de ramas del repositorio.
 */
export async function getGitHubBranches(
  owner: string,
  repo: string,
  accessToken: string
): Promise<string[]> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'TaskForge/1.0'
      }
    });
    
    if (!response.ok) return [];
    
    const branches = await response.json() as any[];
    return branches.map(b => b.name).sort();
  } catch (error) {
    console.error('Error obteniendo ramas de GitHub:', error);
    return [];
  }
}

/**
 * Obtiene el estado de CI/CD para un commit específico.
 */
export async function getGitHubCIStatus(
  owner: string,
  repo: string,
  sha: string,
  accessToken: string
): Promise<GitHubCIStatus[]> {
  // Validate the commit SHA: must be a 40-character hexadecimal string
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    console.error('Invalid SHA provided to getGitHubCIStatus:', sha);
    return [];
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`, {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'TaskForge/1.0'
      }
    });
    
    if (!response.ok) return [];
    
    const data = await response.json() as any;
    const statuses = data.statuses as any[] || [];
    
    return statuses.map((s: any) => ({
      state: s.state as GitHubCIStatus['state'],
      context: s.context,
      description: s.description || '',
      target_url: s.target_url
    }));
  } catch (error) {
    console.error('Error obteniendo estado de CI de GitHub:', error);
    return [];
  }
}

/**
 * Parsea un evento de webhook de GitHub y extrae información relevante.
 */
export function parseGitHubWebhook(
  event: string,
  payload: any
): {
  type: 'push' | 'pull_request' | 'status' | 'create' | 'unknown';
  commit?: GitHubCommit;
  pullRequest?: GitHubPullRequest;
  branch?: string;
  ciStatus?: GitHubCIStatus;
} {
  switch (event) {
    case 'push':
      return {
        type: 'push',
        commit: {
          sha: payload.head_commit?.id || payload.after,
          message: payload.head_commit?.message || payload.commits?.[0]?.message || '',
          author: {
            name: payload.head_commit?.author?.name || payload.commits?.[0]?.author?.name || '',
            email: payload.head_commit?.author?.email || payload.commits?.[0]?.author?.email || ''
          },
          url: payload.head_commit?.url || '',
          html_url: payload.head_commit?.url?.replace('/api.github.com', '/github.com') || '',
          branch: payload.ref?.replace('refs/heads/', '')
        }
      };
      
    case 'pull_request':
      return {
        type: 'pull_request',
        pullRequest: {
          number: payload.pull_request?.number || payload.number,
          title: payload.pull_request?.title || payload.title,
          body: payload.pull_request?.body || payload.body,
          state: payload.pull_request?.state || payload.action === 'closed' && payload.pull_request?.merged ? 'merged' : (payload.pull_request?.state as any),
          head: {
            ref: payload.pull_request?.head?.ref || payload.head?.ref,
            sha: payload.pull_request?.head?.sha || payload.head?.sha
          },
          base: {
            ref: payload.pull_request?.base?.ref || payload.base?.ref
          },
          user: {
            login: payload.pull_request?.user?.login || payload.user?.login || '',
            avatar_url: payload.pull_request?.user?.avatar_url || payload.user?.avatar_url || ''
          },
          html_url: payload.pull_request?.html_url || payload.html_url,
          merged_at: payload.pull_request?.merged_at || payload.merged_at || null
        }
      };
      
    case 'status':
      return {
        type: 'status',
        commit: {
          sha: payload.sha,
          message: '',
          author: { name: '', email: '' },
          url: '',
          html_url: payload.commit?.html_url || ''
        },
        ciStatus: {
          state: payload.state,
          context: payload.context,
          description: payload.description || '',
          target_url: payload.target_url
        }
      };
      
    case 'create':
      return {
        type: 'create',
        branch: payload.ref?.replace('refs/heads/', '')
      };
      
    default:
      return { type: 'unknown' };
  }
}

