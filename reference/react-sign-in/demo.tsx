import { SignInPage } from "@/components/ui/sign-in";

// Hero image: any image you have rights to (for example from Unsplash). No testimonials are passed on purpose.
const SignInPageDemo = () => (
  <div className="bg-background text-foreground">
    <SignInPage
      title={<span className="font-light tracking-tighter">Welcome to Orbit</span>}
      heroImageSrc="/hero.jpg"
      onSignIn={(e) => { e.preventDefault(); console.log(Object.fromEntries(new FormData(e.currentTarget))); }}
      onGoogleSignIn={() => { window.location.href = "/auth/google/start"; }}
      onCreateAccount={() => { window.location.href = "/login.html"; }}
    />
  </div>
);

export default SignInPageDemo;
