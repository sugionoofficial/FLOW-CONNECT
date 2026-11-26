import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Navbar } from '../components/landing/Navbar'
import { Hero } from '../components/landing/Hero'
import { FaqSection, FilmsSection, ModelsSection, ToolsSection, WorkflowSection } from '../components/landing/Sections'
import { Footer } from '../components/landing/Footer'

export default function Landing() {
  const { hash } = useLocation()
  // datang dari halaman lain lewat tautan /#bagian → gulir setelah konten tampil
  useEffect(() => {
    if (!hash) return
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 60)
    return () => clearTimeout(t)
  }, [hash])
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Navbar />
      <main id="main-content">
        <Hero />
        <ModelsSection />
        <WorkflowSection />
        <ToolsSection />
        <FilmsSection />
        <FaqSection />
      </main>
      <Footer />
    </div>
  )
}
