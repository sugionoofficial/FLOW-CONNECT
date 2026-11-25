import { Navbar } from '../components/landing/Navbar'
import { Hero } from '../components/landing/Hero'
import { FaqSection, FilmsSection, ModelsSection, ToolsSection, WorkflowSection } from '../components/landing/Sections'
import { Footer } from '../components/landing/Footer'

export default function Landing() {
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
