// Demo requests from the marketing site.
// TODO before going live: send the request to your CRM, a form service or an email inbox
// (for example a Next.js route handler). Today it only simulates the network call, so
// nothing leaves the browser.

export interface DemoRequest {
  name: string;
  company: string;
  jobTitle: string;
  email: string;
  phone: string;
  machines: string;
  message: string;
  consent: boolean;
  locale: string;
}

export async function submitDemoRequest(request: DemoRequest): Promise<void> {
  void request;
  await new Promise((resolve) => setTimeout(resolve, 700));
}
