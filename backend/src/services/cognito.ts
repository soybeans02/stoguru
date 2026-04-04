import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  AdminConfirmSignUpCommand,
  InitiateAuthCommand,
  GetUserCommand,
  DeleteUserCommand,
  ListUsersCommand,
  ChangePasswordCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminResetUserPasswordCommand,
  AdminDeleteUserCommand,
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

export async function refreshAccessToken(refreshToken: string) {
  const command = new InitiateAuthCommand({
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: getClientId(),
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });
  const result = await client.send(command);
  return {
    accessToken: result.AuthenticationResult?.AccessToken,
    idToken: result.AuthenticationResult?.IdToken,
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
  // サーバーサイドフィルタ（Cognito Filter式はnickname属性を直接フィルタ不可のため、prefix検索+クライアント補完）
  // nickname custom attributeが prefix="nickname" で Cognito Filter使用可能な場合に最適化
  const command = new ListUsersCommand({
    UserPoolId: getUserPoolId(),
    Limit: 60,
    // Cognito Filterは standard attributes (email, name等) のみ対応
    // nickname は custom attribute でないため Filter 利用可能
    Filter: query.length >= 2 ? `nickname ^= "${query.replace(/"/g, '')}"` : undefined,
  });
  try {
    const result = await client.send(command);
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
      .filter((u) => u.nickname.toLowerCase().includes(query.toLowerCase()));
  } catch {
    // Filterが失敗した場合はフォールバック
    const fallbackCommand = new ListUsersCommand({
      UserPoolId: getUserPoolId(),
      Limit: 60,
    });
    const result = await client.send(fallbackCommand);
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
    username: u.Username,
  };
}

// ─── ニックネーム変更 ───

export async function isNicknameTaken(nickname: string, excludeUserId?: string): Promise<boolean> {
  const command = new ListUsersCommand({
    UserPoolId: getUserPoolId(),
    Filter: `nickname = "${nickname.replace(/"/g, '')}"`,
    Limit: 10,
  });
  try {
    const result = await client.send(command);
    return (result.Users ?? []).some((u) => {
      const sub = u.Attributes?.find((a) => a.Name === 'sub')?.Value;
      return sub !== excludeUserId;
    });
  } catch {
    // フィルタ失敗時はフォールバック
    const fallback = new ListUsersCommand({ UserPoolId: getUserPoolId(), Limit: 60 });
    const result = await client.send(fallback);
    return (result.Users ?? []).some((u) => {
      const attrs: Record<string, string> = {};
      u.Attributes?.forEach((a) => { if (a.Name && a.Value) attrs[a.Name] = a.Value; });
      return attrs['nickname'] === nickname && attrs['sub'] !== excludeUserId;
    });
  }
}

export async function updateNickname(userId: string, nickname: string) {
  // Cognito内のユーザー名(email)を取得
  const user = await getUserById(userId);
  if (!user?.username) throw new Error('ユーザーが見つかりません');
  await client.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: getUserPoolId(),
    Username: user.username,
    UserAttributes: [{ Name: 'nickname', Value: nickname }],
  }));
}

// ─── パスワードリセット ───

export async function forgotPassword(email: string) {
  await client.send(new ForgotPasswordCommand({
    ClientId: getClientId(),
    Username: email,
  }));
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string) {
  await client.send(new ConfirmForgotPasswordCommand({
    ClientId: getClientId(),
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  }));
}

// ─── パスワード変更（ユーザー自身） ───

export async function changePassword(accessToken: string, oldPassword: string, newPassword: string) {
  await client.send(new ChangePasswordCommand({
    AccessToken: accessToken,
    PreviousPassword: oldPassword,
    ProposedPassword: newPassword,
  }));
}

// ─── 管理者用ユーザー操作 ───

export async function adminDisableUser(username: string) {
  await client.send(new AdminDisableUserCommand({
    UserPoolId: getUserPoolId(),
    Username: username,
  }));
}

export async function adminEnableUser(username: string) {
  await client.send(new AdminEnableUserCommand({
    UserPoolId: getUserPoolId(),
    Username: username,
  }));
}

export async function adminResetPassword(username: string) {
  await client.send(new AdminResetUserPasswordCommand({
    UserPoolId: getUserPoolId(),
    Username: username,
  }));
}

export async function adminDeleteUser(username: string) {
  await client.send(new AdminDeleteUserCommand({
    UserPoolId: getUserPoolId(),
    Username: username,
  }));
}
