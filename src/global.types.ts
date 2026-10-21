export interface TokenUser {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
}