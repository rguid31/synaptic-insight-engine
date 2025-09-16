// Use CDN import for browser compatibility
import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js'

// Get these from environment variables
const supabaseUrl = 'https://jufmwjpcjueqzrtkpwxu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zm13anBjanVlcXpydGtwd3h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5ODk4MzcsImV4cCI6MjA3MzU2NTgzN30.EUu-N28hkXCh26JLnihnCwoFEkZzBv1hfLz0v5GZFKg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database table names
export const TABLES = {
  USERS: 'users',
  ANALYSES: 'analyses',
  BOOKMARKS: 'bookmarks'
}

// Auth helpers
export const auth = {
  // Sign up new user
  signUp: async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    })
    return { data, error }
  },

  // Sign in user
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  },

  // Sign out user
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Get current user
  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  // Listen to auth changes
  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Database helpers
export const db = {
  // Save analysis to database
  saveAnalysis: async (userId, analysisData) => {
    const { data, error } = await supabase
      .from(TABLES.ANALYSES)
      .insert({
        user_id: userId,
        url: analysisData.url,
        title: analysisData.title,
        analysis_data: analysisData.analysis,
        structured_data: analysisData.structuredData,
        source_text: analysisData.sourceText,
        overall_score: analysisData.overallScore,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    return { data, error }
  },

  // Get user's analysis history
  getUserAnalyses: async (userId, limit = 50) => {
    const { data, error } = await supabase
      .from(TABLES.ANALYSES)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    return { data, error }
  },

  // Save/update bookmark
  saveBookmark: async (userId, analysisId, bookmarkData) => {
    const { data, error } = await supabase
      .from(TABLES.BOOKMARKS)
      .upsert({
        user_id: userId,
        analysis_id: analysisId,
        url: bookmarkData.url,
        title: bookmarkData.title,
        overall_score: bookmarkData.overallScore,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    return { data, error }
  },

  // Remove bookmark
  removeBookmark: async (userId, analysisId) => {
    const { data, error } = await supabase
      .from(TABLES.BOOKMARKS)
      .delete()
      .eq('user_id', userId)
      .eq('analysis_id', analysisId)

    return { data, error }
  },

  // Get user's bookmarks
  getUserBookmarks: async (userId) => {
    const { data, error } = await supabase
      .from(TABLES.BOOKMARKS)
      .select(`
        *,
        analyses!inner(*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    return { data, error }
  },

  // Check if analysis is bookmarked
  isBookmarked: async (userId, analysisId) => {
    const { data, error } = await supabase
      .from(TABLES.BOOKMARKS)
      .select('id')
      .eq('user_id', userId)
      .eq('analysis_id', analysisId)
      .single()

    return { exists: !!data, error }
  }
}

// Migration helpers
export const migration = {
  // Migrate localStorage data to Supabase on first login
  migrateLocalStorageData: async (userId) => {
    try {
      // Get existing localStorage data
      const localBookmarks = JSON.parse(localStorage.getItem('bookmarkedPapers') || '[]')
      const localHistory = JSON.parse(localStorage.getItem('analysisHistory') || '[]')

      let migratedCount = 0

      // Migrate analysis history first
      for (const analysis of localHistory) {
        const { data: savedAnalysis, error: analysisError } = await db.saveAnalysis(userId, {
          url: analysis.url,
          title: analysis.title,
          analysis: analysis.analysis,
          structuredData: analysis.structuredData,
          sourceText: analysis.sourceText,
          overallScore: analysis.overallScore
        })

        if (!analysisError && savedAnalysis) {
          // If this analysis was bookmarked, create bookmark record
          const wasBookmarked = localBookmarks.some(bookmark => bookmark.url === analysis.url)
          if (wasBookmarked) {
            await db.saveBookmark(userId, savedAnalysis.id, {
              url: analysis.url,
              title: analysis.title,
              overallScore: analysis.overallScore
            })
          }
          migratedCount++
        }
      }

      // Clear localStorage after successful migration
      if (migratedCount > 0) {
        localStorage.removeItem('bookmarkedPapers')
        localStorage.removeItem('analysisHistory')
      }

      return { migratedCount, error: null }
    } catch (error) {
      return { migratedCount: 0, error }
    }
  }
}