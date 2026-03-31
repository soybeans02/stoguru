import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  AdminConfirmSignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  DeleteUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({ region: 'ap-northeast-1' });

// 遅延評価（dotenv.config()の後に呼ばれるよう関数化）
export function getUserPoolId() { return process.env.COGNITO_USER_POOL_ID ?? ''; }
function getClientId() { return process.env.COGNITO_CLIENT_ID ?? ''; }

export async function signUp(email: string, password: string, nickname: string) {
  const command = new SignUpCommand({
    ClientId: getClientId(),
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'nickname', Value: nickname },
    ],
  });
  const result = await client.send(command);

  // 開発中: メール確認をスキップして自動確認
  await client.send(new AdminConfirmSignUpCommand({
    UserPoolId: getUserPoolId(),
    Username: email,
  }));

  return result;
}

export async function confirmSignUp(email: string, code: string) {
  const command = new ConfirmSignUpCommand({
    ClientId: getClientId(),
    Username: email,
    ConfirmationCode: code,
  });
  return client.send(command);
}

export async function signIn(email: string, password: string) {
  const command = new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: getClientId(),
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });
  const result = await client.send(command);
  return {
    accessToken: result.AuthenticationResult?.AccessToken,
    idToken: result.AuthenticationResult?.IdToken,
    refreshToken: result.AuthenticationResult?.RefreshToken,
  };
}

export async function deleteUser(accessToken: string) {
  await client.send(new DeleteUserCommand({ AccessToken: accessToken }));
}

export async function getUserFromToken(accessToken: string) {
  const command = new GetUserCommand({ AccessToken: accessToken });
  const result = await client.send(command);
  const attrs: Record<string, string> = {};
  result.UserAttributes?.forEach((a) => {
    if (a.Name && a.Value) attrs[a.Name] = a.Value;
  });
  return {
    userId: attrs['sub'],
    email: attrs['email'],
    nickname: attrs['nickname'] ?? attrs['email']?.split('@')[0],
  };
}

// ─── ユーザー検索（ニックネーム） ───

export async function searchUsers(query: string) {
  const command = new ListUsersCommand({
    UserPoolId: getUserPoolId(),
    Limit: 60,
  });
  const result = await client.send(command);
  const q = query.toLowerCase();
  return (result.Users ?? [])
    .map((u) => {
      const attrs: Record<string, string> = {};
      u.Attributes?.forEach((a) => {
        if (a.Name && a.Value) attrs[a.Name] = a.Value;
      });
      return {
        userId: attrs['sub'],
        nickname: attrs['nickname'] ?? attrs['email']?.split('@')[0],
      };
    })
    .filter((u) => u.nickname.toLowerCase().includes(q));
}

// ─── ユーザー情報取得（userId指定） ───

export async function getUserById(userId: string) {
  // UUIDフォーマットのみ許可（インジェクション防止）
  if (!/^[a-f0-9-]+$/i.test(userId)) return null;
  const command = new ListUsersCommand({
    UserPoolId: getUserPoolId(),
    Filter: `sub = "${userId}"`,
    Limit: 1,
  });
  const result = await client.send(command);
  const u = result.Users?.[0];
  if (!u) return null;
  const attrs: Record<string, string> = {};
  u.Attributes?.forEach((a) => {
    if (a.Name && a.Value) attrs[a.Name] = a.Value;
  });
  return {
    userId: attrs['sub'],
    nickname: attrs['nickname'] ?? attrs['email']?.split('@')[0],
    createdAt: u.UserCreateDate?.toISOString(),
  };
}
