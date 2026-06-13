import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks a route as guard-exempt (login, register, static pages...).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
