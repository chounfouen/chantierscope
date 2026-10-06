/**
 * Theme clair, sombre ou celui du systeme.
 *
 * Le choix est garde dans le stockage local sous la cle `theme`, la meme que
 * la bibliotheque employee auparavant : le choix deja fait par un
 * utilisateur est conserve.
 */

export type Theme = 'light' | 'dark' | 'system'
export type ThemeResolu = 'light' | 'dark'

export const CLE_THEME = 'theme'

/**
 * Script execute avant le premier affichage, dans l'en-tete du document :
 * il pose la classe `dark` avant que la page ne se peigne, et evite l'eclair
 * d'un theme clair chez qui a choisi le sombre. Injecte par la mise en page
 * racine avec next/script, strategie beforeInteractive : jamais rendu par
 * React dans le navigateur, ou il ne serait pas execute.
 */
export const SCRIPT_THEME = `(function(){try{var t=localStorage.getItem('${CLE_THEME}');var s=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',s);e.style.colorScheme=s?'dark':'light'}catch(_){}})()`
