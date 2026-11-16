import { redirect } from 'next/navigation';

/** The conversation is now the home page; old links still arrive there. */
export default function TalkPage() {
  redirect('/');
}
