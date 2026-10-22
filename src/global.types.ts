export interface TokenUser {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
    iat: number;
    exp: number
}